import ChatView from './메신저';

export default ChatView;

export type ChatViewProps = Parameters<typeof ChatView>[0];
export type ChatViewController = Record<string, any>;

export function useChatViewController(): ChatViewController {
  return {};
}
