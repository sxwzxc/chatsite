"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  userId: string;
  nickname: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  timestamp: number;
  type: "text" | "file" | "system";
}

interface User {
  id: string;
  nickname: string;
  lastSeen: number;
  color: string;
}

const STORAGE_KEY = "chatsite_user_id";
const STORAGE_NICK = "chatsite_nickname";

function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatRoom() {
  const [userId, setUserId] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化用户
  useEffect(() => {
    const uid = localStorage.getItem(STORAGE_KEY);
    const nick = localStorage.getItem(STORAGE_NICK) || "";
    setUserId(uid || generateUserId());
    setNickname(nick);
    setNickInput(nick);
  }, []);

  // 保存 userId 到 localStorage
  useEffect(() => {
    if (userId && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, userId);
    }
  }, [userId]);

  // 注册用户 & 开始轮询
  useEffect(() => {
    if (!userId) return;
    registerUser();
    startPolling();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, nickname]);

  async function registerUser() {
    try {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, nickname: nickname || undefined }),
      });
    } catch { /* ignore */ }
  }

  function startPolling() {
    stopPolling();
    pollTimerRef.current = setInterval(() => {
      fetchMessages();
      fetchUsers();
    }, 2000);
    // 立即拉一次
    fetchMessages();
    fetchUsers();
  }

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  const lastTsRef = useRef(0);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/messages?since=${lastTsRef.current}`);
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages(prev => {
          const all = [...prev, ...data.messages];
          // 去重
          const seen = new Set<string>();
          const unique = all.filter((m: Message) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          unique.sort((a: Message, b: Message) => a.timestamp - b.timestamp);
          return unique.slice(-200);
        });
        lastTsRef.current = data.messages[data.messages.length - 1]?.timestamp || lastTsRef.current;
      }
    } catch { /* ignore */ }
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch { /* ignore */ }
  }

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 发送文本消息
  async function sendMessage(content: string) {
    if (!content.trim()) return;
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, nickname, content: content.trim(), type: "text" }),
      });
      setInputText("");
      fetchMessages();
    } catch { /* ignore */ }
  }

  // 发送文件
  async function sendFile(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            nickname,
            content: `[文件] ${data.fileName}`,
            type: "file",
            fileUrl: data.url,
            fileName: data.fileName,
            fileSize: data.fileSize,
          }),
        });
        fetchMessages();
      }
    } catch { /* ignore */ }
    finally { setUploading(false); }
  }

  // 修改昵称
  async function saveNickname() {
    const trimmed = nickInput.trim();
    if (!trimmed) return;
    setNickname(trimmed);
    localStorage.setItem(STORAGE_NICK, trimmed);
    setEditingNick(false);
    await registerUser();
  }

  // 回车发送，Shift+回车换行
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  }

  const onlineCount = users.length;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#ececf1]">
      {/* 侧边栏 - 在线用户 */}
      <div
        className={`fixed md:relative z-40 w-64 h-full bg-[#111111] border-r border-[#1f1f2e] transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="p-4 border-b border-[#1f1f2e]">
          <h2 className="text-lg font-semibold text-[#22c55e]">在线用户</h2>
          <p className="text-sm text-[#6b6b80] mt-1">{onlineCount} 人在线</p>
        </div>
        <div className="overflow-y-auto h-[calc(100%-80px)] p-2">
          {users.map((u) => (
            <div key={u.id} className="user-item">
              <div className="online-dot flex-shrink-0" />
              <span
                className="truncate text-sm"
                style={{ color: u.color }}
              >
                {u.nickname}
                {u.id === userId && " (你)"}
              </span>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-[#6b6b80] text-center py-8">暂无在线用户</p>
          )}
        </div>
      </div>

      {/* 遮罩（移动端侧边栏打开时） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col h-screen min-w-0">
        {/* 顶部栏 */}
        <header className="flex items-center gap-3 px-4 py-3 bg-[#111111] border-b border-[#1f1f2e]">
          <button
            className="md:hidden text-[#6b6b80] hover:text-white transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22c55e] animate-pulse" />
            <h1 className="text-lg font-bold text-white">ChatSite 聊天室</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setEditingNick(true); setNickInput(nickname); }}
              className="text-sm text-[#6b6b80] hover:text-[#22c55e] transition-colors px-2 py-1 rounded"
              title="修改昵称"
            >
              {nickname || "设置昵称"}
            </button>
          </div>
        </header>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-[#6b6b80] py-16">
              <div className="text-4xl mb-4">💬</div>
              <p>还没有消息，来发第一条吧！</p>
            </div>
          )}

          {messages.map((msg) => {
            const isSelf = msg.userId === userId;
            if (msg.type === "system") {
              return (
                <div key={msg.id} className="message-bubble-system animate-fade-in">
                  {msg.content}
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                className={`flex ${isSelf ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div className={`max-w-[75%] ${isSelf ? "order-2" : "order-1"}`}>
                  {!isSelf && (
                    <div className="text-xs mb-1 px-3" style={{ color: users.find(u => u.id === msg.userId)?.color || "#6b6b80" }}>
                      {msg.nickname}
                    </div>
                  )}
                  {msg.type === "file" ? (
                    <div className={`${isSelf ? "message-bubble-self" : "message-bubble-other"} px-4 py-3`}>
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-5 h-5 text-[#22c55e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="text-sm font-medium">{msg.fileName}</span>
                      </div>
                      {msg.fileSize && (
                        <div className="text-xs text-[#6b6b80]">{formatFileSize(msg.fileSize)}</div>
                      )}
                      {msg.fileUrl && (
                        <a
                          href={msg.fileUrl}
                          download={msg.fileName}
                          className="text-xs text-[#22c55e] hover:underline mt-1 inline-block"
                        >
                          下载文件 ↓
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className={`${isSelf ? "message-bubble-self" : "message-bubble-other"} px-4 py-2.5 break-words whitespace-pre-wrap`}>
                      {msg.content}
                    </div>
                  )}
                  <div className={`text-xs text-[#6b6b80] mt-1 ${isSelf ? "text-right" : "text-left"}`}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="px-4 py-3 bg-[#111111] border-t border-[#1f1f2e]">
          {uploading && (
            <div className="text-xs text-[#22c55e] mb-2">正在上传文件...</div>
          )}
          <div className="flex items-end gap-2">
            {/* 文件上传按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-shrink-0 p-2 text-[#6b6b80] hover:text-[#22c55e] transition-colors disabled:opacity-50"
              title="发送文件"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) sendFile(file);
                e.target.value = "";
              }}
            />

            {/* 消息输入框 */}
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息...（Enter 发送，Shift+Enter 换行）"
              className="chat-input flex-1 bg-[#1a1a1a] border border-[#1f1f2e] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6b6b80] focus:outline-none focus:border-[#22c55e] transition-colors resize-none"
              rows={1}
            />

            {/* 发送按钮 */}
            <button
              onClick={() => sendMessage(inputText)}
              disabled={!inputText.trim()}
              className="flex-shrink-0 px-4 py-2.5 bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-[#14532d] disabled:text-[#4a4a4a] text-white rounded-lg transition-colors text-sm font-medium"
            >
              发送
            </button>
          </div>
        </div>
      </div>

      {/* 修改昵称模态框 */}
      {editingNick && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#1f1f2e] rounded-xl p-6 w-full max-w-sm animate-fade-in">
            <h3 className="text-lg font-semibold text-white mb-4">修改昵称</h3>
            <input
              value={nickInput}
              onChange={(e) => setNickInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); }}
              placeholder="请输入昵称"
              className="w-full bg-[#1a1a1a] border border-[#1f1f2e] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6b6b80] focus:outline-none focus:border-[#22c55e] transition-colors"
              autoFocus
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => setEditingNick(false)}
                className="px-4 py-2 text-sm text-[#6b6b80] hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveNickname}
                className="px-4 py-2 text-sm bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
