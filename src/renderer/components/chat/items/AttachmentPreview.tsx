import { CodeBlockViewer } from '../viewers/CodeBlockViewer';
import { MarkdownViewer } from '../viewers/MarkdownViewer';

import type { UserAttachment } from '@main/types';

interface AttachmentPreviewProps {
  attachment: UserAttachment;
  showPreviews: boolean;
}

function formatBytes(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return 'unknown size';
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentReasonLabel(attachment: UserAttachment): string {
  switch (attachment.previewReason) {
    case 'too_large':
      return 'Preview skipped: file is larger than 2 MB';
    case 'decode_error':
      return 'Preview skipped: decode failed';
    case 'binary':
      return 'Preview skipped: binary payload';
    case 'unsupported_mime':
      return `Preview skipped: unsupported MIME (${attachment.mimeType})`;
    default:
      return 'Preview unavailable';
  }
}

function inferCodeLanguage(mimeType: string): string {
  switch (mimeType) {
    case 'application/json':
      return 'json';
    case 'application/xml':
    case 'text/xml':
      return 'xml';
    case 'application/javascript':
    case 'application/x-javascript':
    case 'text/javascript':
      return 'javascript';
    case 'application/typescript':
    case 'application/x-typescript':
    case 'text/typescript':
      return 'typescript';
    case 'application/x-python':
    case 'text/x-python':
      return 'python';
    case 'application/x-sh':
    case 'application/x-shellscript':
    case 'text/x-sh':
    case 'text/x-shellscript':
      return 'bash';
    case 'application/x-yaml':
    case 'application/yaml':
    case 'text/yaml':
    case 'text/x-yaml':
      return 'yaml';
    case 'application/x-toml':
    case 'text/toml':
      return 'toml';
    case 'text/html':
      return 'html';
    case 'text/css':
      return 'css';
    default:
      return 'text';
  }
}

function renderPreviewContent(attachment: UserAttachment): JSX.Element {
  if (attachment.kind === 'image' && attachment.dataUrl) {
    return (
      <div className="chat-attachment-image-wrap">
        <img className="chat-attachment-image" src={attachment.dataUrl} alt="User attachment preview" />
      </div>
    );
  }

  if (attachment.kind === 'markdown' && attachment.textContent) {
    return (
      <div className="chat-attachment-markdown">
        <MarkdownViewer markdown={attachment.textContent} />
      </div>
    );
  }

  if (attachment.kind === 'code' && attachment.textContent) {
    return (
      <CodeBlockViewer
        code={attachment.textContent}
        language={inferCodeLanguage(attachment.mimeType)}
        title="Attachment code"
      />
    );
  }

  if (attachment.kind === 'text' && attachment.textContent) {
    return (
      <pre className="chat-attachment-text">
        {attachment.textContent}
      </pre>
    );
  }

  return <p className="chat-attachment-note">{attachmentReasonLabel(attachment)}</p>;
}

export const AttachmentPreview = ({ attachment, showPreviews }: AttachmentPreviewProps): JSX.Element => {
  const isPreviewEnabled = showPreviews && attachment.previewable;

  return (
    <article className="chat-attachment-card">
      <header className="chat-attachment-header">
        <span className="chat-attachment-kind">{attachment.kind}</span>
        <span className="chat-attachment-meta">
          <code>{attachment.mimeType}</code>
          <span>{formatBytes(attachment.sizeBytes)}</span>
        </span>
      </header>

      {!showPreviews ? (
        <p className="chat-attachment-note">Preview disabled in settings</p>
      ) : null}

      {showPreviews && !attachment.previewable ? (
        <p className="chat-attachment-note">{attachmentReasonLabel(attachment)}</p>
      ) : null}

      {isPreviewEnabled ? renderPreviewContent(attachment) : null}
    </article>
  );
};
