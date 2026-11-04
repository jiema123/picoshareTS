import { readFile } from "node:fs/promises";
import { PicoShareError, normalizeNoteSlug } from "../api-client.mjs";

async function getContent(options) {
  const sources = Number(options.content !== undefined) + Number(options.file !== undefined) + Number(Boolean(options.stdin));
  if (sources > 1) throw new PicoShareError("Choose only one of --content, --file, or --stdin.", { code: "INVALID_ARGUMENT" });
  if (options.content !== undefined) return options.content;
  if (options.file) return readFile(options.file, "utf8");
  if (options.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new PicoShareError("Cloud note content is required.", {
    code: "INVALID_ARGUMENT",
    fix: "Pass --content, --file, or --stdin.",
  });
}

function passwordFromEnv(variableName) {
  const password = process.env[variableName];
  if (!password) {
    throw new PicoShareError(`Password environment variable '${variableName}' is not set.`, {
      code: "CONFIG_MISSING",
      fix: `Set ${variableName} in the environment; do not put a password in command history.`,
    });
  }
  return password;
}

export function registerNoteCommands(program, action) {
  const notes = program.command("notes").description("List, read, write, and share cloud notes");

  notes.command("list")
    .description("List cloud notes")
    .option("--search <text>", "Case-insensitive search in slug")
    .option("--limit <number>", "Limit displayed results")
    .action(action("notes.list", async ({ client, options }) => {
      let items = await client.listNotes();
      if (!Array.isArray(items)) throw new PicoShareError("Unexpected cloud note list response from PicoShare.", { code: "INVALID_RESPONSE" });
      if (options.search) {
        const search = options.search.toLowerCase();
        items = items.filter((item) => String(item.slug || "").toLowerCase().includes(search));
      }
      if (options.limit != null) {
        const limit = Number(options.limit);
        if (!Number.isInteger(limit) || limit <= 0) throw new PicoShareError("--limit must be a positive integer.", { code: "INVALID_ARGUMENT" });
        items = items.slice(0, limit);
      }
      return { result: items, nextActions: items[0] ? [`picoshare notes get ${items[0].slug}`] : [] };
    }));

  notes.command("get <slug>")
    .description("Read a private cloud note")
    .action(action("notes.get", async ({ client, args }) => {
      const slug = normalizeNoteSlug(args[0]);
      return { result: await client.getNote(slug), nextActions: [`picoshare notes share ${slug}`] };
    }));

  notes.command("put <slug>")
    .description("Create a cloud note or replace its content")
    .option("--content <text>", "Note content (use --file for multiline or large content)")
    .option("--file <path>", "Read note content from a UTF-8 file")
    .option("--stdin", "Read note content from standard input")
    .option("--replace", "Allow replacing different content at an existing slug")
    .action(action("notes.put", async ({ client, args, options }) => {
      const slug = normalizeNoteSlug(args[0]);
      const content = await getContent(options);
      const result = await client.putNote(slug, content, { replace: options.replace });
      return { result, nextActions: [`picoshare notes get ${slug}`, `picoshare notes share ${slug}`] };
    }));

  notes.command("share <slug>")
    .description("Print the public read-only URL for a cloud note")
    .action(action("notes.share", async ({ client, args }) => {
      const slug = normalizeNoteSlug(args[0]);
      const note = await client.getNote(slug);
      if (!note.publicId) throw new PicoShareError(`Cloud note '${slug}' does not have a public share ID yet.`, {
        code: "NOT_SHARED",
        fix: "Write the note once with 'notes put' to create its share ID.",
      });
      return { result: { slug, publicId: note.publicId, shareUrl: client.noteShareUrl(note.publicId) }, nextActions: [] };
    }));

  notes.command("public <public-id>")
    .description("Read a public cloud note")
    .option("--password-env <name>", "Environment variable containing the clip password", "PICOSHARE_CLIP_PASSWORD")
    .action(action("notes.public", async ({ client, args, options }) => {
      const password = process.env[options.passwordEnv] || undefined;
      return { result: await client.readPublicNote(args[0], password), nextActions: [] };
    }));

  notes.command("password <slug>")
    .description("Set or remove a cloud note password")
    .option("--remove", "Remove the current password")
    .option("--password-env <name>", "Environment variable containing the new password", "PICOSHARE_CLIP_PASSWORD")
    .action(action("notes.password", async ({ client, args, options }) => {
      const slug = normalizeNoteSlug(args[0]);
      const password = options.remove ? null : passwordFromEnv(options.passwordEnv);
      return { result: await client.setNotePassword(slug, password), nextActions: [`picoshare notes share ${slug}`] };
    }));
}
