import { NextRequest, NextResponse } from "next/server";

// 内存存储（演示用）
const uploadedFiles = new Map<string, { name: string; data: string; type: string; size: number; uploadedAt: number }>();

// POST /api/upload - 上传文件（Base64 方式，适合小文件演示）
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未找到文件" }, { status: 400 });
    }

    // 限制文件大小（最大 5MB，演示用）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "文件超过 5MB 限制" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 存储文件信息（实际项目中应存到云存储 OSS/COS 等）
    uploadedFiles.set(fileId, {
      name: file.name,
      data: `data:${file.type};base64,${base64}`,
      type: file.type,
      size: file.size,
      uploadedAt: Date.now(),
    });

    // 只保留最近 50 个文件
    if (uploadedFiles.size > 50) {
      const firstKey = uploadedFiles.keys().next().value as string;
      uploadedFiles.delete(firstKey);
    }

    return NextResponse.json({
      success: true,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      // 返回 base64 data URL 供前端直接使用
      url: `data:${file.type};base64,${base64}`,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

// GET /api/upload - 获取已上传的文件（按 fileId 查询）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");

  if (!fileId || !uploadedFiles.has(fileId)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const file = uploadedFiles.get(fileId)!;
  return NextResponse.json(file);
}
