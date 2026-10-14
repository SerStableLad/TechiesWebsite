import type { Member, Team } from "../../emdash-env";

export interface PersonProfile {
  id: string;
  data: Member | Team;
  edit: Record<string, Record<string, string>>;
}

export interface DirectoryProfile extends PersonProfile {
  excoRoles: string[];
  aliases: string[];
}

export function zoomOutPortrait(slug: string, crop: { x: number; y: number; size: number }) {
  // shortcut: calibrated to current member photos; revisit when these photos are replaced.
  const factors: Record<string, number> = {
    "alec-teo": 1.5,
    "richard-lee": 1.5,
    "dalton-prescott-ng": 1.5,
    "ee-one-lim": 1.4,
    "gaurav-kumar-manek": 1.4,
    "kaleb-nim": 1.3,
    "krishna": 1.4,
  };
  const factor = factors[slug];
  if (!factor) return crop;
  const size = Math.min(1, crop.size * factor);
  const expansion = (size - crop.size) / 2;
  return { x: Math.max(0, Math.min(1 - size, crop.x - expansion)), y: Math.max(0, crop.y - expansion), size };
}

function linkedinId(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return undefined;
    return /^\/in\/([^/]+)/.exec(url.pathname)?.[1].toLowerCase();
  } catch { return undefined; }
}

export function samePerson(a: PersonProfile, b: PersonProfile) {
  const linkedin = linkedinId(a.data.linkedin);
  return a.id === b.id || Boolean(linkedin && linkedin === linkedinId(b.data.linkedin));
}

export function linkedinVariants(team: PersonProfile[]) {
  return [...new Set(team.flatMap(profile => {
    const id = linkedinId(profile.data.linkedin);
    if (!id) return [];
    // Existing records use regional/www hosts and optional trailing slashes.
    return [profile.data.linkedin!, ...["linkedin.com", "www.linkedin.com", "sg.linkedin.com"].flatMap(host =>
      ["https", "http"].flatMap(protocol => [`${protocol}://${host}/in/${id}`, `${protocol}://${host}/in/${id}/`]))];
  }))];
}

export function mergePeople(team: PersonProfile[], teamMembers: PersonProfile[], members: PersonProfile[], firstPage: boolean): DirectoryProfile[] {
  const exco: DirectoryProfile[] = [];
  for (const organiser of team) {
    const existing = exco.find(person => samePerson(person, organiser));
    if (existing) {
      if (organiser.data.role && !existing.excoRoles.includes(organiser.data.role)) existing.excoRoles.push(organiser.data.role);
      if (organiser.id !== existing.id) existing.aliases.push(organiser.id);
      continue;
    }
    const member = [...teamMembers, ...members].find(person => samePerson(person, organiser));
    const profile = member ?? organiser;
    const data = { ...organiser.data, ...profile.data };
    const edit = { ...organiser.edit, ...profile.edit };
    for (const field of ["photo", "bio", "linkedin", "website", "github"] as const) {
      // Empty member fields must not hide an existing organiser profile detail.
      Object.assign(data, { [field]: profile.data[field] || organiser.data[field] });
      if (!profile.data[field] && organiser.edit[field]) edit[field] = organiser.edit[field];
    }
    exco.push({ ...profile, data, edit, excoRoles: organiser.data.role ? [organiser.data.role] : [], aliases: member && member.id !== organiser.id ? [organiser.id] : [] });
  }
  const otherMembers = members.filter(member => !team.some(organiser => samePerson(member, organiser)))
    .map(member => ({ ...member, excoRoles: [], aliases: [] }));
  return [...(firstPage ? exco : []), ...otherMembers];
}

export function presentationRecaps(recaps: Member["recaps"] = []) {
  return recaps.map(block => {
    if (!Array.isArray(block.children)) return block;
    return { ...block, children: block.children.map(span => ({
      ...span,
      text: typeof span.text === "string" ? span.text.replace(/^Speaker\s*·\s*/, "Presented at ").replace(/Presented at Roast #/, "Presented at Roast My TechStack #") : span.text,
    })) };
  });
}
