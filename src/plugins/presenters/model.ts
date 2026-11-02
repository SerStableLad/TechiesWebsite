export const pluginId = "techies-presenters";
export const defaultForm = {
  title: "Bring your stack. Bring your questions.",
  intro: "Interested in presenting at Roast My TechStack? Tell us what you’re building. No polished pitch or perfect architecture needed.",
  contactLabel: "Who are you, and how can we reach you?",
  nameLabel: "Your name",
  whatsappLabel: "WhatsApp number",
  projectLabel: "What are you building?",
  projectHelp: "A few sentences about your project and tech stack is enough. Share a challenge you’d like to discuss, if you have one.",
  themeLabel: "Which theme fits your project best?",
  themes: "",
  unsureLabel: "Not sure — help me choose",
  guidelinesTitle: "What to expect",
  guidelines: "15 minutes to present, then 15 minutes of technical Q&A about your stack and architecture.\nNo actual roasting. This is a constructive community conversation, with the host guiding the questions.\nYou don’t need every answer. Say ‘I don’t know’, ask for help, and we’ll open it to the floor.\nTechnical sharing, not a sales pitch. A small call to action is fine.\nArrive around 6:30 pm so we can connect your laptop to the screen.",
  consent: "I agree to these presentation guidelines and may be contacted via WhatsApp about presenting.",
  buttonLabel: "I’m interested",
  note: "This is an expression of interest, not a confirmed presentation slot. Your contact details are only visible to the organising team.",
  successTitle: "You’re on our radar.",
  successMessage: "Thanks for putting yourself forward! We’ll contact you on WhatsApp to discuss your project, theme fit and a possible slot.",
  closedMessage: "Presenter interest is currently closed. Please check back for the next session.",
  open: true,
};
export type PresenterForm = typeof defaultForm;
export class PresenterError extends Error {}
export const themeOptions = (form: PresenterForm) => [...new Set(form.themes.split(/\r?\n/).map(value => value.trim()).filter(Boolean)), form.unsureLabel].filter((value, i, all) => all.indexOf(value) === i);
export function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PresenterError(`Please enter ${label} (up to ${max} characters).`);
  return value.trim();
}
export function parseForm(input: unknown): PresenterForm {
  if (!input || typeof input !== "object") throw new PresenterError("Please check the form settings.");
  const source = input as Record<string, unknown>;
  const result = { ...defaultForm };
  for (const key of Object.keys(defaultForm) as Array<keyof PresenterForm>) {
    if (key === "open") {
      if (typeof source.open !== "boolean") throw new PresenterError("Please choose whether the form is open.");
      result.open = source.open;
    } else if (key === "themes") {
      if (typeof source.themes !== "string" || source.themes.length > 5000) throw new PresenterError("Please keep the theme list under 5,000 characters.");
      result.themes = source.themes.trim();
    } else result[key] = text(source[key], key, 5000);
  }
  if (themeOptions(result).length > 51) throw new PresenterError("Please use no more than 50 themes.");
  return result;
}
export function parseSubmission(input: unknown, form: PresenterForm) {
  if (!input || typeof input !== "object") throw new PresenterError("Please check your answers.");
  const data = input as Record<string, unknown>;
  if (!form.open) throw new PresenterError(form.closedMessage);
  if (data.website) throw new PresenterError("We couldn’t accept that submission. Please try again.");
  if (data.consent !== true) throw new PresenterError("Please agree to the presentation guidelines.");
  const name = text(data.name, "your name", 100);
  const whatsapp = text(data.whatsapp, "your WhatsApp number with country code", 40).replace(/[\s()\-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(whatsapp)) throw new PresenterError("Please enter a WhatsApp number with country code, e.g. +65 8123 4567.");
  const project = text(data.project, "a short description of your project and stack", 3000);
  const theme = text(data.theme, "a theme", 5000);
  if (!themeOptions(form).includes(theme)) throw new PresenterError("The theme list changed. Refresh this page and choose a theme again.");
  const requestId = text(data.requestId, "a submission ID", 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new PresenterError("Please refresh the page and try again.");
  return { name, whatsapp, project, theme, requestId };
}
export type PresenterSubmission = ReturnType<typeof parseSubmission> & { createdAt: string; guidelines: string; consent: string; formRevision: string };
