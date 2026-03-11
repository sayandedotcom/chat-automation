"use client";

import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import { Markdown } from "tiptap-markdown";

const lowlight = createLowlight();
lowlight.register("javascript", javascript);
lowlight.register("js", javascript);
lowlight.register("typescript", typescript);
lowlight.register("ts", typescript);
lowlight.register("python", python);
lowlight.register("py", python);
lowlight.register("css", css);
lowlight.register("html", xml);
lowlight.register("xml", xml);
lowlight.register("json", json);
lowlight.register("yaml", yaml);
lowlight.register("yml", yaml);
lowlight.register("sql", sql);
lowlight.register("shell", shell);
lowlight.register("bash", shell);
lowlight.register("sh", shell);
lowlight.register("markdown", markdown);
lowlight.register("md", markdown);

// Note: we do NOT add @tiptap/extension-link separately because
// tiptap-markdown's Markdown extension bundles its own Link extension.
// We DO add Table/Row/Cell/Header, TaskList, TaskItem as base extensions;
// tiptap-markdown's Markdown extension extends these for markdown parsing.
export function createMarkdownExtensions(options: { editable: boolean }): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
    }),
    CodeBlockLowlight.configure({
      lowlight,
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({
      html: false,
      transformPastedText: true,
      linkify: !options.editable,
    }),
  ];
}
