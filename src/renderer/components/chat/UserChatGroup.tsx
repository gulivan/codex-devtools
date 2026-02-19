import { format } from 'date-fns';

import { useAppStore } from '@renderer/store';

import { AttachmentPreview } from './items/AttachmentPreview';
import { MarkdownViewer } from './viewers/MarkdownViewer';

import type { UserChunk } from '@main/types';

interface UserChatGroupProps {
  chunk: UserChunk;
}

export const UserChatGroup = ({ chunk }: UserChatGroupProps): JSX.Element => {
  const showAttachmentPreviews = useAppStore((state) => state.appConfig?.display.showAttachmentPreviews ?? true);
  const attachments = chunk.attachments ?? [];

  return (
    <div className="chat-user-row">
      <div className="chat-user-bubble">
        <MarkdownViewer markdown={chunk.content} />
        {attachments.length > 0 ? (
          <section className="chat-attachments">
            {attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                showPreviews={showAttachmentPreviews}
              />
            ))}
          </section>
        ) : null}
        <time className="chat-user-time">{format(new Date(chunk.timestamp), 'p')}</time>
      </div>
    </div>
  );
};
