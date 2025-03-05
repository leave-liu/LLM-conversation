import { PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useChatStore } from "~/store";
import { useEffect, useState } from "react";
import { MessageInter } from "~/types";

interface ChatSession {
  id: string;
  lastMessage: string;
  timestamp: Date;
  messages: MessageInter[];
}

export default function ChatSidebar() {
  const store = useChatStore();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);

  // 当前会话消息变化时更新会话列表
  useEffect(() => {
    if (store.messages.length > 0 && activeSession) {
      const lastMsg = store.messages[store.messages.length - 1];
      updateSessionMessages(activeSession, store.messages, lastMsg.text || "新对话");
    }
  }, [store.messages, activeSession]);

  // 更新指定会话的消息
  const updateSessionMessages = (sessionId: string, messages: MessageInter[], lastMessage: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        return {
          ...session,
          lastMessage,
          messages,
          timestamp: new Date()
        };
      }
      return session;
    }));
  };

  // 创建新会话
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      lastMessage: "新对话",
      timestamp: new Date(),
      messages: []
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSession(newSession.id);
    store.setMessages([]); // 清空当前消息
  };

  // 切换会话
  const switchSession = (sessionId: string) => {
    setActiveSession(sessionId);
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      store.setMessages(session.messages); // 加载会话消息
    }
  };

  // 删除会话
  const deleteSession = (sessionId: string) => {
    if (window.confirm("确定要删除这个会话吗？")) {
      setSessions(prev => prev.filter(session => session.id !== sessionId));
      if (activeSession === sessionId) {
        setActiveSession(null);
        store.setMessages([]);
      }
    }
  };

  return (
    <div className="w-64 h-full bg-gray-100 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">历史会话</h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={createNewSession}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <PlusCircleIcon className="w-5 h-5 text-gray-600" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>添加新对话</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map(session => (
          <div
            key={session.id}
            className={cn(
              "p-3 cursor-pointer hover:bg-gray-200 transition-colors group relative",
              activeSession === session.id && "bg-gray-200"
            )}
            onClick={() => switchSession(session.id)}
          >
            <div className="text-sm text-gray-900 font-medium mb-1 pr-8 truncate">
              {session.lastMessage}
            </div>
            <div className="text-xs text-gray-500">
              {session.timestamp.toLocaleString()}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-300 rounded-lg transition-all"
                  >
                    <TrashIcon className="w-4 h-4 text-gray-600" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>删除会话</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ))}
      </div>
    </div>
  );
} 