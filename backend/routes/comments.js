const express = require('express');
const router = express.Router({ mergeParams: true });
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../db');
const { auth, teamOnly } = require('../middleware/auth');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(`*, author:users(id, name, role),
        replies(*, author:users(id, name, role))`)
      .eq('drawing_id', req.params.drawingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ comments: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { text, type, pinX, pinY } = req.body;
    if (!text || !type) return res.status(400).json({ error: 'Text and type required' });

    const { data, error } = await supabase
      .from('comments')
      .insert({ drawing_id: req.params.drawingId, author_id: req.user.id,
        text, type, pin_x: pinX, pin_y: pinY, status: 'open' })
      .select(`*, author:users(id, name, role)`).single();

    if (error) throw error;
    res.status(201).json({ comment: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

router.post('/:commentId/replies', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    const { data, error } = await supabase
      .from('replies')
      .insert({ comment_id: req.params.commentId, author_id: req.user.id, text })
      .select(`*, author:users(id, name, role)`).single();

    if (error) throw error;

    if (req.user.role === 'team') {
      await supabase.from('comments').update({ status: 'interpreted' }).eq('id', req.params.commentId);
    }

    res.status(201).json({ reply: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

router.post('/:commentId/improve-reply', auth, teamOnly, async (req, res) => {
  try {
    const { draft } = req.body;
    if (!draft) return res.status(400).json({ error: 'Draft required' });

    const { data: comment } = await supabase
      .from('comments').select('text, type').eq('id', req.params.commentId).single();

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are a writing assistant for Xpress Draft, an Australian drafting firm.
Tone: practical, professional, confident, supportive, concise. No jargon. No filler.
Improve the team member's reply to a client comment. Keep the meaning exactly the same.
Client's original comment: "${comment?.text}"
Return ONLY the improved message text, no preamble.`,
      messages: [{ role: 'user', content: draft }]
    });

    res.json({ improved: message.content[0].text });
  } catch (err) {
    console.error('AI improve error:', err);
    res.status(500).json({ error: 'Failed to improve reply' });
  }
});

router.post('/:commentId/interpret', auth, teamOnly, async (req, res) => {
  try {
    const { commentId, drawingId } = req.params;
    const { markupDescription } = req.body;

    const { data: comment } = await supabase
      .from('comments').select('*, author:users(name)').eq('id', commentId).single();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are an expert drafting assistant at Xpress Draft, an Australian drafting firm.
A client has left a comment on a drawing. Interpret what change they are requesting
and describe it clearly so the client can confirm and the drafter can action it.
Format your response as:
INTERPRETATION: [one clear sentence of what you understood]
ACTION: [bullet points of what the drafter will do]
CONFIRMATION REQUEST: [one sentence asking the client to confirm]`,
      messages: [{
        role: 'user',
        content: `Client comment: "${comment.text}"
Comment type: ${comment.type}
Additional markup description: ${markupDescription || 'None provided'}`
      }]
    });

    const interpretation = message.content[0].text;

    await supabase.from('replies').insert({
      comment_id: commentId,
      author_id: req.user.id,
      text: interpretation,
      is_ai_interpreted: true
    });

    await supabase.from('comments').update({ status: 'interpreted' }).eq('id', commentId);

    res.json({ interpretation });
  } catch (err) {
    console.error('AI interpret error:', err);
    res.status(500).json({ error: 'Failed to interpret markup' });
  }
});

router.post('/:commentId/confirm', auth, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: 'Only clients can confirm revisions' });
    }

    const { commentId, drawingId } = req.params;

    const { data: drawing } = await supabase
      .from('drawings').select('project_id').eq('id', drawingId).single();
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });

    const { data: project } = await supabase
      .from('projects').select('*, revisions(*)').eq('id', drawing.project_id).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stageRevisions = (project.revisions || []).filter(r => r.stage === project.stage && !r.is_bonus);
    const bonusRevisions = (project.revisions || []).filter(r => r.stage === project.stage && r.is_bonus);
    const freeAllowed = project.stage === 'preliminary' ? 2 : 1;
    const totalAllowed = freeAllowed + bonusRevisions.length;
    const used = stageRevisions.length;

    if (used >= totalAllowed) {
      return res.status(400).json({
        error: 'No revisions remaining',
        revisionSummary: buildRevisionSummary(project.stage, project.revisions)
      });
    }

    const nextRevNum = used + 1;
    const stageLabel = project.stage === 'preliminary' ? 'PR' : 'WD';

    await supabase.from('revisions').insert({
      project_id: project.id,
      stage: project.stage,
      revision_number: nextRevNum,
      is_bonus: false,
      confirmed_by: req.user.id
    });

    const { data: comment } = await supabase
      .from('comments').select('text').eq('id', commentId).single();

    await supabase.from('revision_confirmations').insert({
      project_id: project.id,
      drawing_id: drawingId,
      client_id: req.user.id,
      stage: project.stage,
      revision_number: nextRevNum,
      ai_interpretation: comment?.text
    });

    await supabase.from('comments').update({ status: 'confirmed' }).eq('id', commentId);

    const newRevisions = [...(project.revisions || []),
      { stage: project.stage, revision_number: nextRevNum, is_bonus: false }];

    res.json({
      message: `Revision ${stageLabel}: ${nextRevNum} of ${totalAllowed} confirmed`,
      revisionSummary: buildRevisionSummary(project.stage, newRevisions)
    });
  } catch (err) {
    console.error('Confirm revision error:', err);
    res.status(500).json({ error: 'Failed to confirm revision' });
  }
});

function buildRevisionSummary(stage, revisions) {
  const freeAllowed = stage === 'preliminary' ? 2 : 1;
  const stageLabel = stage === 'preliminary' ? 'PR' : 'WD';
  const bonusGranted = revisions.filter(r => r.stage === stage && r.is_bonus).length;
  const used = revisions.filter(r => r.stage === stage && !r.is_bonus).length;
  const totalAllowed = freeAllowed + bonusGranted;
  return {
    stage, stageLabel, used, freeAllowed, bonusGranted, totalAllowed,
    remaining: Math.max(0, totalAllowed - used),
    overAllowance: used > totalAllowed,
    displayText: `${stageLabel}: ${used} of ${totalAllowed}`
  };
}

module.exports = router;
