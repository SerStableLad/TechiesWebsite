// node scripts/check-people.mjs — directory composition, identity and presentation labels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkedinVariants, mergePeople, presentationRecaps, samePerson, zoomOutPortrait } from '../src/utils/people.ts';

const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const profile = entry => ({ id: entry.slug, data: entry.data, edit: {} });
const team = seed.content.team.map(profile);
const members = seed.content.members.map(profile);
const people = mergePeople(team, members, members, true);
assert.equal(people.length, team.length + members.length - 2, 'Overlapping Exco members appear once');
const jesse = people.filter(person => person.id === 'jesse-sng');
assert.equal(jesse.length, 1);
assert.deepEqual(jesse[0].excoRoles, ['Community Experience Lead']);
assert.ok(jesse[0].data.projects.length, 'Member projects survive the merge');
const ying = people.find(person => person.id === 'ying-zhao');
assert.deepEqual(ying.excoRoles, ['Programming Ops Lead']);
assert.deepEqual(ying.aliases, ['yingzhao-ouyang'], 'Both legacy identities remain addressable');
assert.ok(ying.data.website && ying.data.github && ying.data.linkedin, 'All member contact links survive');
assert.equal(people.find(person => person.id === 'leong-han-wai').excoRoles[0], 'Lead Organizer');
assert.ok(linkedinVariants(team).includes('https://www.linkedin.com/in/yzouyang/'));
assert.equal(samePerson({ id: 'a', data: {} }, { id: 'b', data: {} }), false, 'Missing links do not match');
assert.equal(samePerson({ id: 'a', data: { linkedin: 'https://evil.example/in/test' } }, { id: 'b', data: { linkedin: 'https://evil.example/in/test' } }), false);

const secondPage = mergePeople(team, members, members.slice(2, 8), false);
assert.ok(!secondPage.some(person => person.excoRoles.length), 'Exco members do not repeat on later cursor pages');
assert.ok(secondPage.some(person => person.id === 'kaleb-nim'), 'Later-page members remain');
const firstPage = mergePeople(team, members, members.slice(0, 1), true);
assert.ok(firstPage.find(person => person.id === 'ying-zhao').data.projects.length, 'Exco details resolve even outside the current member page');
const extraRole = { ...team[1], data: { ...team[1].data, role: 'Event host' } };
assert.deepEqual(mergePeople([...team, extraRole], members, [], true).find(person => person.id === 'jesse-sng').excoRoles, ['Community Experience Lead', 'Event host']);

const labelled = presentationRecaps(jesse[0].data.recaps);
assert.equal(labelled[0].children[0].text, 'Presented at Roast My TechStack #2');
assert.deepEqual(labelled[0].markDefs, jesse[0].data.recaps[0].markDefs, 'Recap links remain unchanged');
assert.equal(jesse[0].data.recaps[0].children[0].text, 'Speaker · Roast #2', 'Stored content remains unchanged');
assert.deepEqual(presentationRecaps(), []);
const adjustedSlugs = ['alec-teo', 'richard-lee', 'dalton-prescott-ng', 'ee-one-lim', 'gaurav-kumar-manek', 'kaleb-nim', 'krishna'];
for (const person of members) {
  const original = person.data.portrait_crop;
  if (!original) continue;
  const adjusted = zoomOutPortrait(person.id, original);
  if (!adjustedSlugs.includes(person.id)) {
    assert.equal(adjusted, original, `${person.id}: unchanged crop`);
    continue;
  }
  assert.ok(adjusted.size > original.size, `${person.id}: wider crop`);
  assert.ok(adjusted.x >= 0 && adjusted.y >= 0 && adjusted.x + adjusted.size <= 1, 'Crop stays within horizontal image bounds');
  assert.ok(adjusted.x <= original.x && adjusted.x + adjusted.size >= original.x + original.size, 'Wider crop retains the original framing');
  if (adjusted.x > 0 && adjusted.x + adjusted.size < 1) {
    assert.ok(Math.abs(adjusted.x + adjusted.size / 2 - (original.x + original.size / 2)) < 1e-12, 'Centre is preserved unless constrained by an image edge');
  }
}
assert.deepEqual(zoomOutPortrait('alec-teo', { x: 0, y: 0, size: .9 }), { x: 0, y: 0, size: 1 }, 'Zoom out is capped at full width');
console.log('People checks passed: identity merge, Exco roles, legacy anchors, cursor pages and presentation labels.');
