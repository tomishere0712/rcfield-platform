import { ChatResponse, FbButton, FbFormattedMessage } from '../types';

const MAX_TEXT_LEN = 2000;
const MAX_BUTTON_TEXT_LEN = 640; // FB button template text limit
const MAX_QUICK_REPLIES = 5;
const MAX_TITLE_LEN = 20;
const MAX_BUTTONS = 3; // FB button template limit

export class FbMessengerFormatter {
  static format(response: ChatResponse): FbFormattedMessage {
    const { text: stripped, buttons } = this.extractLinks(response.answer);
    const clean = this.stripMarkdown(stripped);

    const quickReplies = (response.quickReplies ?? []).slice(0, MAX_QUICK_REPLIES).map((title) => ({
      content_type: 'text' as const,
      title: title.substring(0, MAX_TITLE_LEN),
      payload: `QR_${title
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .substring(0, 900)}`,
    }));

    if (buttons.length > 0) {
      // Button template: text capped at 640, URL hidden behind button label
      const text =
        clean.length > MAX_BUTTON_TEXT_LEN
          ? clean.substring(0, clean.lastIndexOf(' ', MAX_BUTTON_TEXT_LEN)) ||
            clean.substring(0, MAX_BUTTON_TEXT_LEN)
          : clean || ' '; // FB requires non-empty text
      return { text, quickReplies, buttons };
    }

    const text =
      clean.length > MAX_TEXT_LEN
        ? clean.substring(0, clean.lastIndexOf(' ', MAX_TEXT_LEN)) ||
          clean.substring(0, MAX_TEXT_LEN)
        : clean;
    return { text, quickReplies };
  }

  // Pull markdown links out as FB buttons (max 3), remove from text
  private static extractLinks(text: string): { text: string; buttons: FbButton[] } {
    const buttons: FbButton[] = [];
    const cleaned = text
      .replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
        if (buttons.length < MAX_BUTTONS) {
          buttons.push({ type: 'web_url', url, title: label.substring(0, MAX_TITLE_LEN) });
        }
        return '';
      })
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    return { text: cleaned, buttons };
  }

  private static stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/gs, '$1')
      .replace(/\*(.+?)\*/gs, '$1')
      .replace(/`{1,3}[\s\S]*?`{1,3}/g, (m) => m.replace(/`/g, '').trim())
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .trim();
  }
}
