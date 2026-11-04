#!/usr/bin/env node

import { Command } from "commander";
import { PicoShareClient } from "../src/api-client.mjs";
import { registerFileCommands } from "../src/commands/files.mjs";
import { registerNoteCommands } from "../src/commands/notes.mjs";
import { isJsonMode, printFailure, printSuccess } from "../src/output.mjs";

const program = new Command();
program
  .name("picoshare")
  .description("Manage PicoShare files, share links, and cloud notes")
  .version("0.1.0")
  .option("--base-url <url>", "PicoShare service URL (defaults to PICOSHARE_BASE_URL)")
  .option("--json", "Force machine-readable JSON output");

function action(commandName, handler) {
  return async (...actionArgs) => {
    const command = actionArgs.at(-1);
    const options = command.optsWithGlobals();
    const jsonMode = isJsonMode(options);
    try {
      const client = new PicoShareClient(options);
      const response = await handler({ client, args: command.args, options });
      printSuccess(commandName, response?.result ?? response, response?.nextActions || [], jsonMode);
    } catch (error) {
      printFailure(commandName, error, jsonMode);
      process.exitCode = 1;
    }
  };
}

registerFileCommands(program, action);
registerNoteCommands(program, action);

program.action(() => {
  if (!process.stdout.isTTY || program.opts().json) {
    const result = {
      name: "picoshare",
      description: program.description(),
      commands: program.commands.map((group) => ({
        name: group.name(),
        description: group.description(),
        commands: group.commands.map((command) => ({ name: command.name(), description: command.description() })),
      })),
    };
    printSuccess("help", result, [], true);
  } else {
    program.help();
  }
});

await program.parseAsync(process.argv);
