# Lists & Follow-ups

ListBlock(items: ListItem[], variant?: "number" | "image", size?: "default" | "small") — A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list.
ListItem(title: string, subtitle?: string, image?: {src: string, alt: string}, actionLabel?: string, action?: ActionExpression) — Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable.
FollowUpBlock(items: FollowUpItem[]) — List of clickable follow-up suggestions placed at the end of a response
FollowUpItem(text: string) — Clickable follow-up suggestion — when clicked, sends text as user message
- Use ListBlock with ListItem references for numbered lists.
- Use FollowUpBlock with FollowUpItem references at the end of a response to suggest next actions.
- A ListItem is clickable ONLY when given an action (5th argument); without one it is plain text.
- Clicking a FollowUpItem, or a ListItem with a @ToAssistant action, sends text to the LLM as a user message.
- Example: list = ListBlock([item1, item2])  item1 = ListItem("Option A", "Details about A", null, null, Action([@ToAssistant("Option A")]))
