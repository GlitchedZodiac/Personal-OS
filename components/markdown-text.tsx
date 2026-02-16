"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MarkdownTextProps {
  text: string;
  className?: string;
}

/**
 * Lightweight inline markdown renderer for AI responses.
 * Supports: **bold**, *italic*, bullet lists (- / •), numbered lists, headings (##), emojis.
 * No external dependencies.
 */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag
          key={key++}
          className={cn(
            "space-y-1.5 my-2",
            listType === "ul" ? "list-disc pl-5" : "list-decimal pl-5"
          )}
        >
          {listItems}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line — flush list, add spacer
    if (!trimmed) {
      flushList();
      elements.push(<div key={key++} className="h-1.5" />);
      continue;
    }

    // Heading: ## or ###
    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <p key={key++} className="text-xs font-bold mt-3 mb-1 text-foreground">
          {renderInline(trimmed.slice(4))}
        </p>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <p key={key++} className="text-sm font-bold mt-3 mb-1 text-foreground">
          {renderInline(trimmed.slice(3))}
        </p>
      );
      continue;
    }

    // Unordered list: - item, • item, * item (not bold)
    const ulMatch = trimmed.match(/^[-•]\s+(.+)$/) || trimmed.match(/^\*\s+(.+)$/);
    if (ulMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(
        <li key={key++} className="text-sm leading-relaxed text-foreground/90">
          {renderInline(ulMatch[1])}
        </li>
      );
      continue;
    }

    // Ordered list: 1. item, 1) item
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(
        <li key={key++} className="text-sm leading-relaxed text-foreground/90">
          {renderInline(olMatch[1])}
        </li>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={key++} className="text-sm leading-relaxed text-foreground/90">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className={cn("space-y-0.5", className)}>{elements}</div>;
}

/**
 * Renders inline markdown: **bold**, *italic*, `code`
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let i = 0;

  while (remaining.length > 0) {
    // Find the earliest pattern
    const boldIdx = remaining.indexOf("**");
    const codeIdx = remaining.indexOf("`");

    // Bold: **text**
    if (boldIdx !== -1) {
      const endBold = remaining.indexOf("**", boldIdx + 2);
      if (endBold !== -1 && (codeIdx === -1 || boldIdx <= codeIdx)) {
        if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
        parts.push(
          <strong key={i++} className="font-semibold text-foreground">
            {remaining.slice(boldIdx + 2, endBold)}
          </strong>
        );
        remaining = remaining.slice(endBold + 2);
        continue;
      }
    }

    // Code: `text`
    if (codeIdx !== -1) {
      const endCode = remaining.indexOf("`", codeIdx + 1);
      if (endCode !== -1 && (boldIdx === -1 || codeIdx < boldIdx)) {
        if (codeIdx > 0) parts.push(remaining.slice(0, codeIdx));
        parts.push(
          <code
            key={i++}
            className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono"
          >
            {remaining.slice(codeIdx + 1, endCode)}
          </code>
        );
        remaining = remaining.slice(endCode + 1);
        continue;
      }
    }

    // No more patterns — push the rest
    parts.push(remaining);
    break;
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
