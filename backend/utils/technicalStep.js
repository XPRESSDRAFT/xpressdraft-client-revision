// Turns the Technical Work mirror columns on an Overall Projects item into
// plain-English lines for the CLIENT's dashboard, e.g. "Site visit booked
// for 21 Oct". It only ever receives the type, status and date. It is never
// given who is doing the work, so a name cannot leak into what a client sees.

const split = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

function friendlyType(t) {
  const u = String(t || '').trim().toUpperCase();
  if (u === 'SITE VISIT') return 'Site visit';
  if (u.startsWith('3D MODELLING')) return '3D model';
  if (u === '3D RENDER') return '3D render';
  const s = u.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "2026-10-21" -> "21 Oct" (or "21 Oct 2026"). Parsed as a calendar date,
// not a moment in time, so time zones can't shift it by a day.
function friendlyDate(iso, withYear = false) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

// types / statuses / dates are the mirror columns' display values. With
// several linked tasks they arrive comma-separated and in the same order.
// If the lists don't line up, nothing is guessed: dates are dropped, or the
// whole thing is skipped.
function technicalStepsFrom({ types, statuses, dates }) {
  const T = split(types), S = split(statuses), D = split(dates);
  if (!T.length || T.length !== S.length) return [];
  const haveDates = D.length === T.length;
  const lines = [];
  T.forEach((t, i) => {
    const type = friendlyType(t);
    const status = S[i].toUpperCase();
    const date = haveDates ? friendlyDate(D[i]) : null;
    let line = null;
    if (['TO DO', 'AVAILABLE', 'ACKNOWLEDGED'].includes(status)) line = date ? `${type} booked for ${date}` : `${type} being scheduled`;
    else if (['SITE VISIT', 'IN PROGRESS'].includes(status)) line = `${type} in progress`;
    else if (status === 'REVIEW') line = `${type} being checked`;
    else if (status === 'COMPLETED') line = `${type} completed`;
    if (line && !lines.includes(line)) lines.push(line);
  });
  return lines;
}

module.exports = { technicalStepsFrom, friendlyDate };
