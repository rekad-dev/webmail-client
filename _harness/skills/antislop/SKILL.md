---
name: antislop
description: Filter UI, product copy, accessibility, and responsive work for generic AI patterns while keeping the result specific to this webmail product.
metadata:
  source: https://github.com/miqdadbadjuber/anti-slop
  status: project-adaptation
---

# Antislop for this project

This is a concise project adaptation of the upstream Anti Slop rules, not a verbatim installation of its complete rulebook. The network was unavailable when the harness was created. The upstream project describes itself as a filter rather than a style guide and supplies the full rule set at the source link above.

## Resolve the mode

At the first antislop use in a session, use an explicit mode chosen in the current conversation. If none was chosen and a valid saved antislop preference exists, use that. Otherwise ask whether to apply the filter during the work or audit after it is complete.

- During mode guides UI or copy as it is built and ends with the delivery gate below.
- After mode produces a numbered findings list. Do not edit until the user selects which findings to fix.
- Do not save a global preference unless the user explicitly asks.

## Project direction

Use the product brief's direction: focused, lightweight, fast, intuitive, and functional. The brief does not establish a palette, type system, or brand voice. Do not invent unsupported visual rules or product claims; ask for direction when the choice materially affects the result.

## Filter

- Give every visual technique a clear job in hierarchy, identity, readability, or interaction. Do not stack familiar gradients, glow, glass, cards, badges, and motion just because they are common in generated interfaces.
- Make each screen specific to email work and its actual content. Avoid generic landing-page sections, fake activity, invented metrics, fake testimonials, and decorative mock mail data presented as real.
- Every control must work or be omitted. Keep loading, empty, error, success, and disabled states coherent with the real operation.
- Keep messages and email contents trustworthy: never fabricate delivery, security, or persistence claims. Treat displayed email HTML as untrusted content and follow PROMPT.md security requirements.
- Check keyboard use, focus visibility, contrast, reduced motion, and phone-sized layouts. Avoid horizontal overflow and preserve the user's message content while layouts reflow.
- Prefer concise, human product copy. Remove filler, empty claims, and generic assistant phrasing.

## Delivery gate

Before presenting UI or copy work as complete, report pass/fail with a short reason for:

1. Product-specific direction and purposeful visual choices.
2. Functional controls and real application states.
3. Accurate claims and non-fabricated content.
4. Keyboard, focus, contrast, motion, and responsive behavior relevant to the change.
5. Alignment with PROMPT.md and the active phase acceptance criteria.

