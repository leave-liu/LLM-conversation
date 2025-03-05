import type { MetaFunction } from "@remix-run/node";
import ChatInput from "~/components/chat/ChatInput";
import ChatContent from "~/components/chat/ChatContent";
import ChatDialog from "~/components/chat/ChatDialog";
import ChatSetting from "~/components/chat/ChatSetting";
import { asyncOAuthToken } from "~/apis/data";
import { useEffect } from "react";
import { getStorageSetting, updateTwoToken } from "~/utils/storage";
import { toast } from "sonner";
import { ChatError } from "~/utils/error";
import ChatSidebar from "~/components/chat/ChatSidebar";

export const meta: MetaFunction = () => {
  return [
    { title: "New Chat App" },
    { name: "description", content: "Welcome to Chat!" },
  ];
};

export default function Index() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    const init = async () => {
      try {
        if (code) {
          const res = await asyncOAuthToken(
            code,
            getStorageSetting()?.code_verifier
          );
          const data = await res.json();
          if (data.access_token) {
            updateTwoToken(data.access_token, data.refresh_token);
            toast.success("授权成功");
            window.location.href = "/";
          } else throw new Error(data.error_message);
        }
      } catch (error) {
        console.log("error", error);
        const err = ChatError.fromError(error);
        toast.error(err.message);
      }
    };
    init();
  }, []);
  
  return (
    <div className="flex h-screen bg-white">
      <ChatSidebar />
      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b border-gray-200 flex items-center justify-end px-4 bg-white">
          <div className="flex items-center gap-2">
            <ChatDialog />
            <ChatSetting />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatContent type="page" />
        </div>
        <ChatInput type="page" />
      </div>
    </div>
  );
}
