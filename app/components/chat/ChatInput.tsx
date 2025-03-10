import { Button } from "../ui/button";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import { useChatStore } from "~/store";
import {
  ChatContentType,
  content_type,
  FileInfoInter,
  MessageApiInter,
  MessageInter,
  object_string_type,
  ResponseMessageType,
  ResponseRetrieveInter,
} from "~/types";
import TextareaAutosize from "react-textarea-autosize";
import { PaperclipIcon, SendIcon, StopCircleIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import FileCard from "~/components/chat/FileCard";
import { parseSSEResponse } from "~/utils/sse";
import { allowFileList, allowImageList } from "~/utils/file";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { ChatError } from "~/utils/error";
import { cloneDeep } from "lodash-es";
import {
  asyncChat,
  asyncRefreshToken,
  asyncRetrievePolling,
} from "~/apis/data";
import ImageCard from "./ImageCard";
import { getStorageSetting, updateTwoToken } from "~/utils/storage";

export default function ChatInput({ type }: ChatContentType) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<FileInfoInter[]>([]);
  const [images, setImages] = useState<FileInfoInter[]>([]);
  const [messages, setMessages] = useState<MessageApiInter[]>([]);
  const [abort_controller, setAbortController] = useState<AbortController>();
  const store = useChatStore();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (store.sendMessageFlag && type === "page")
      sendMessage(store.sendMessageFlag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sendMessageFlag]);

  useEffect(() => {
    if (store.sendMessageFlagInline && type === "inline")
      sendMessage(store.sendMessageFlagInline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sendMessageFlagInline]);

  const buildContent = (
    text: string,
    fileList: FileInfoInter[],
    imageList: FileInfoInter[]
  ) => {
    const arr = [];
    let content_type: content_type = "text";
    if (text)
      arr.push({
        type: "text",
        text,
      });
    if (fileList.length > 0) {
      content_type = "object_string";
      fileList.forEach((fileInfo) => {
        if (fileInfo.status == "uploaded")
          arr.push({
            type: "file",
            file_id: fileInfo.file_id,
          });
      });
    }
    if (imageList.length > 0) {
      content_type = "object_string";
      imageList.forEach((fileInfo) => {
        if (fileInfo.status == "uploaded")
          arr.push({
            type: "image",
            file_id: fileInfo.file_id,
          });
      });
    }
    return { arr, content_type };
  };
  const buildMessage = (v?: string) => {
    const { arr, content_type } = buildContent(v || prompt, files, images);
    return {
      role: "user",
      content: JSON.stringify(arr),
      content_type,
    } as MessageApiInter;
  };
  const resetInput = () => {
    setPrompt("");
    setFiles([]);
    setImages([]);
  };
  const sendMessage = async (v?: string) => {
    setIsLoading(true);
    resetInput();
    const abort_controller = new AbortController();
    setAbortController(abort_controller);
    const user: MessageInter = {
      role: "user",
      text: v || prompt,
      files,
      images,
    };
    const result: MessageInter = {
      role: "assistant",
      text: "",
      suggestions: [],
    };
    updateStoreMessage(user, result);
    const newMessage = buildMessage(v);
    const _messages = [...messages, newMessage];
    await getResonse(_messages, abort_controller, user, result);
  };
  const getResonse = async (
    _messages: MessageApiInter[],
    abort_controller: AbortController,
    user: MessageInter,
    result: MessageInter
  ) => {
    try {
      const res = await asyncChat(_messages, abort_controller);
      console.log("res", res);
      const contentType = res.headers.get("Content-Type");
      if (contentType?.includes("text/event-stream")) {
        await handleSSEResponse(res, user, result, _messages);
      } else {
        const jsonData = await res.json();
        if (!getStorageSetting()?.stream && jsonData.code === 0) {
          const res: ResponseRetrieveInter = await asyncRetrievePolling(
            jsonData.data.conversation_id,
            jsonData.data.id
          );
          if (res.code !== 0) throw new Error(res.msg || "Request failed");
          else {
            const { data } = res;
            const answer = data.find((item) => item.type === "answer");
            if (answer) result.text = answer.content;
            const follow_up = data.filter((item) => item.type === "follow_up");
            if (follow_up)
              result.suggestions = follow_up.map((item) => item.content);
            setMessages([
              ..._messages,
              { role: "assistant", content: result.text } as MessageApiInter,
            ]);
          }
        } else if (jsonData.code == 4100) {
          if (getStorageSetting()?.auth_type == "one") {
            throw new Error(
              "Please set the correct token in the settings page！！！"
            );
          } else {
            const res = await asyncRefreshToken();
            const data = await res.json();
            if (data.access_token) {
              updateTwoToken(data.access_token, data.refresh_token);
              // Resend message
              await getResonse(_messages, abort_controller, user, result);
            } else throw new Error(data.error_message);
          }
        } else throw new Error(jsonData.msg || "Request failed");
      }
    } catch (err) {
      const error = ChatError.fromError(err);
      console.log("error", error);
      // If the request is aborted, display part of the content, do not display the error
      if (error.message == "BodyStreamBuffer was aborted") return;
      result.error = error.message;
      updateStoreMessage(user, result);
    } finally {
      if (store.sendMessageFlag) store.setSendMessageFlag("");
      if (store.sendMessageFlagInline) store.setSendMessageFlagInline("");
      if (result.suggestions?.length == 0) result.suggestions = undefined;
      updateStoreMessage(user, result);
      setIsLoading(false);
    }
  };
  const handleSSEResponse = async (
    res: Response,
    user: MessageInter,
    result: MessageInter,
    _messages: MessageApiInter[]
  ) => {
    await parseSSEResponse(res, (message) => {
      if (message.includes("[DONE]")) {
        setMessages([
          ..._messages,
          { role: "assistant", content: result.text } as MessageApiInter,
        ]);
        return;
      }
      let data: ResponseMessageType;
      try {
        data = JSON.parse(message);
      } catch (err) {
        throw new Error("Parsing failed");
      }
      if (["answer"].includes(data?.type) && !data.created_at) {
        result.text += data?.content;
        updateStoreMessage(user, result);
      } else if (data?.type === "follow_up") {
        result.suggestions?.push(data.content);
      } else if (data?.status == "failed") {
        throw new Error(data.last_error!.msg);
      }
    });
  };
  const abortChat = () => {
    if (abort_controller) abort_controller.abort();
  };
  const updateStoreMessage = (user: MessageInter, result?: MessageInter) => {
    if (result) {
      if (type === "page") store.setMessages([...store.messages, user, result]);
      else if (type === "inline")
        store.setMessagesInline([...store.messages_inline, user, result]);
    } else {
      if (type === "page") {
        store.setMessages([...store.messages, user]);
      } else if (type === "inline") {
        store.setMessagesInline([...store.messages_inline, user]);
      }
    }
  };
  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        const pos = inputRef.current?.selectionStart || 0;
        setPrompt((pre) => `${pre.slice(0, pos)}\n${pre.slice(pos)}`);
        setTimeout(() => {
          inputRef.current!.setSelectionRange(pos + 1, pos + 1);
        }, 0);
      } else {
        await sendMessage();
      }
    }
  };

  const handleFileChange = async (
    e: ChangeEvent<HTMLInputElement>,
    type: object_string_type
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type == "file") setFiles([...files, { file, name: file.name }]);
    else if (type == "image") setImages([...images, { file, name: file.name }]);
    else toast.error("Unsupported file type");
  };

  const removeFile = (index: number, type: object_string_type) => {
    if (type == "file") {
      const clone_file = cloneDeep(files);
      clone_file.splice(index, 1);
      setFiles(clone_file);
    } else if (type == "image") {
      const clone_img = cloneDeep(images);
      clone_img.splice(index, 1);
      setImages(clone_img);
    }
  };
  return (
    <div className="relative">
      <div className="flex flex-col space-y-4">
        {(files.length > 0 || images.length > 0) && (
          <div className="flex flex-wrap gap-3 px-6 py-3 bg-gray-50 rounded-lg mx-4">
            {files.map((fileInfo, index) => (
              <div key={index} className="relative group">
                <FileCard file={fileInfo} />
                <button
                  onClick={() => removeFile(index, "file")}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
            {images.map((fileInfo, index) => (
              <div key={index} className="relative group">
                <ImageCard file={fileInfo} />
                <button
                  onClick={() => removeFile(index, "image")}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3 p-4 bg-white border-t relative">
          <div className="flex-1 min-h-[20px] bg-gray-50 rounded-xl px-4 py-3">
            <TextareaAutosize
              ref={inputRef}
              placeholder="输入消息，Shift + Enter 换行..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-full resize-none bg-transparent outline-none border-0 focus:ring-0 p-0 text-base leading-6 placeholder:text-gray-400"
              maxRows={5}
            />
          </div>
          <div className="flex items-center gap-2 px-2">
            <input
              type="file"
              id="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileChange(e, "file")}
              accept={allowFileList.join(",")}
            />
            <input
              type="file"
              id="image"
              multiple
              className="hidden"
              onChange={(e) => handleFileChange(e, "image")}
              accept={allowImageList.join(",")}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    htmlFor="file"
                    className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors flex items-center justify-center"
                  >
                    <PaperclipIcon className="w-5 h-5 text-gray-500" />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>上传文件</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    htmlFor="image"
                    className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors flex items-center justify-center"
                  >
                    <PhotoIcon className="w-5 h-5 text-gray-500" />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>上传图片</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isLoading ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={abortChat}
                className="hover:bg-red-50 hover:text-red-500 transition-colors rounded-lg"
              >
                <StopCircleIcon className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => sendMessage()}
                disabled={!prompt && files.length === 0 && images.length === 0}
                className="hover:bg-blue-50 hover:text-blue-500 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SendIcon className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
