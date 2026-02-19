import { format } from 'date-fns';

import { MarkdownViewer } from './viewers/MarkdownViewer';

import type { UserChunk } from '@main/types';

interface UserChatGroupProps {
  chunk: UserChunk;
}

export const UserChatGroup = ({ chunk }: UserChatGroupProps): JSX.Element => {
  return (
    <div className="chat-user-row">
      <div className="chat-user-bubble">
        <MarkdownViewer markdown={chunk.content} />
        <time className="chat-user-time">{format(new Date(chunk.timestamp), 'p')}</time>
      </div>
    </div>
  );
};
