import { NextResponse } from "next/server";

// 内存存储（演示用，生产环境需使用数据库）
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

// 全局内存存储
const messages: Message[] = [];
const users = new Map<string, { id: string; nickname: string; lastSeen: number; color: string }>();

let msgId = 0;

// GET /api/messages - 获取消息列表
export async function GET() {
  const now = Date.now();
  // 清理在线用户（超过 30 秒未活跃视为离线）
  for (const [id, user] of users) {
    if (now - user.lastSeen > 30000) {
      users.delete(id);
    }
  }
  return NextResponse.json({ messages, users: Array.from(users.values()) });
}

// POST /api/messages - 发送消息
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, nickname, content, type, fileUrl, fileName, fileSize } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    // 更新用户活跃时间
    if (users.has(userId)) {
      users.get(userId)!.lastSeen = Date.now();
    }

    const message: Message = {
      id: `msg_${++msgId}`,
      userId,
      nickname: nickname || "匿名用户",
      content: content || "",
      type: type || "text",
      timestamp: Date.now(),
      ...(fileUrl && { fileUrl }),
      ...(fileName && { fileName }),
      ...(fileSize !== undefined && { fileSize }),
    };

    messages.push(message);

    // 只保留最近 200 条消息
    if (messages.length > 200) {
      messages.splice(0, messages.length - 200);
    }

    return NextResponse.json({ success: true, message });
  } catch {
    return NextResponse.json({ error: "发送失败" }, { status: 500 });
  }
}
