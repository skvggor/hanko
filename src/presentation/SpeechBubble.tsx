export interface SpeechBubbleProps {
  authorName?: string;
  text: string;
}

export function SpeechBubble({ authorName, text }: Readonly<SpeechBubbleProps>) {
  return (
    <div aria-hidden="true" className="speech-bubble">
      {authorName !== undefined && <strong className="speech-bubble__author">{authorName}</strong>}
      <p className="speech-bubble__text">{text}</p>
    </div>
  );
}
