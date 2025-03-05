import { useChatStore } from "~/store";
import { useEffect, useRef, useState } from "react";
import { ChatContentType, MessageInter } from "~/types";
import Markdown from "~/components/markdown";
import FileCard from "~/components/chat/FileCard";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";
import { MdSkeleton, SuggestionSkeleton } from "~/components/chat/ChatSkeleton";
import assistantAvatar from "public/ymjh.jpg";
import { toast } from "sonner";

export default function ChatContent({ type }: ChatContentType) {
  const store = useChatStore();
  const [messages, setMessages] = useState<MessageInter[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (type === "inline") {
      setMessages(store.messages_inline);
    } else {
      setMessages(store.messages);
    }
  }, [store, type]);

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages, shouldAutoScroll]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: "smooth"
      });
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const scrollPosition = scrollHeight - scrollTop - clientHeight;
      const isBottom = scrollPosition < 100;
      setIsNearBottom(isBottom);
      setShouldAutoScroll(isBottom);
    }
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success("复制成功");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      // 如果 navigator.clipboard 不可用，使用传统方法
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopiedIndex(index);
        toast.success("复制成功");
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch (err) {
        toast.error("复制失败，请手动复制");
      }
      document.body.removeChild(textArea);
    }
  };

  const sendMessage = (v: string) => {
    if (type === "inline") {
      store.setSendMessageFlagInline(v);
    } else {
      store.setSendMessageFlag(v);
    }
  };

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "h-full overflow-y-auto px-4 scroll-smooth",
          type === "inline" && "h-[400px]"
        )}
      >
        {messages.map((item, index) => (
          <div
            key={index}
            className={cn(
              "py-4 animate-slideIn",
              index === messages.length - 1 && "animate-fadeIn"
            )}
          >
            {item.role === "assistant" && (
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                  <img src={assistantAvatar} alt="Assistant" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  {!item.error ? (
                    item.text ? (
                      <div className="group bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                        <div className="prose max-w-none">
                          <Markdown>{item.text}</Markdown>
                        </div>
                        <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopy(item.text || "", index)}
                            className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                          >
                            {copiedIndex === index ? (
                              <CheckIcon className="w-4 h-4 text-green-500" />
                            ) : (
                              <ClipboardDocumentIcon className="w-4 h-4 text-gray-500" />
                            )}
                            <span className="text-sm text-gray-500">
                              {copiedIndex === index ? "已复制" : "复制"}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <MdSkeleton />
                    )
                  ) : (
                    <p className="text-red-500 break-words bg-red-50 p-4 rounded-lg">{item.error}</p>
                  )}
                  {index === messages.length - 1 &&
                    item.suggestions &&
                    (item.suggestions?.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {item.suggestions.map((item, index) => (
                          <button
                            key={index}
                            onClick={() => sendMessage(item)}
                            className="px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <SuggestionSkeleton />
                    ))}
                </div>
              </div>
            )}
            {item.role === "user" && (
              <div className="flex items-start flex-row-reverse space-x-reverse space-x-3">
                <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-semibold">
                  U
                </div>
                <div className="flex-1">
                  <div className="flex flex-col items-end space-y-3">
                    {item.images && item.images.length > 0 && (
                      <div className="flex flex-wrap gap-3 justify-end">
                        {item.images?.map((fileItem, fileIndex) => (
                          <img
                            src={fileItem.base64}
                            className="w-[200px] h-[200px] rounded-lg object-cover shadow-sm"
                            key={fileIndex}
                            alt={fileItem.name}
                          />
                        ))}
                      </div>
                    )}
                    {item.files && item.files.length > 0 && (
                      <div className="flex flex-wrap gap-3 justify-end">
                        {item.files?.map((fileItem, fileIndex) => (
                          <FileCard key={fileIndex} file={fileItem} />
                        ))}
                      </div>
                    )}
                    <div className="bg-blue-500 text-white px-4 py-3 rounded-lg shadow-sm max-w-lg">
                      <pre className="whitespace-pre-wrap break-words text-sm">
                        {item.text}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!isNearBottom && (
        <button
          onClick={() => {
            setShouldAutoScroll(true);
            scrollToBottom();
          }}
          className="absolute bottom-4 right-4 bg-blue-500 text-white rounded-full p-2 shadow-lg hover:bg-blue-600 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
