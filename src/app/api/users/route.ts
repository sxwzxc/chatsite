import { NextRequest, NextResponse } from "next/server";

interface User {
  id: string;
  nickname: string;
  lastSeen: number;
  color: string;
}

const users = new Map<string, User>();
const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
let userCount = 0;

function getColor(index: number) {
  return colors[index % colors.length];
}

// GET /api/users - 获取用户列表
export async function GET() {
  const now = Date.now();
  // 清理超时用户（30秒）
  for (const [id, user] of users) {
    if (now - user.lastSeen > 30000) {
      users.delete(id);
    }
  }
  return NextResponse.json({ users: Array.from(users.values()) });
}

// POST /api/users - 注册/更新用户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, nickname } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    const now = Date.now();
    if (users.has(userId)) {
      // 更新已有用户
      const user = users.get(userId)!;
      user.nickname = nickname || user.nickname;
      user.lastSeen = now;
      users.set(userId, user);
      return NextResponse.json({ success: true, user });
    } else {
      // 新用户
      userCount++;
      const user: User = {
        id: userId,
        nickname: nickname || `用户${userCount}`,
        lastSeen: now,
        color: getColor(userCount),
      };
      users.set(userId, user);
      return NextResponse.json({ success: true, user, isNew: true });
    }
  } catch {
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

// DELETE /api/users - 用户离开
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (userId) {
    users.delete(userId);
  }
  return NextResponse.json({ success: true });
}
