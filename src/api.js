// Dán endpoint của project MockAPI vào đây (không kèm tên resource).
export const API_URL = 'https://6afecb313a0e70bc8d53f855.mockapi.io';

const VIDEOS = `${API_URL}/youtube2`;

async function request(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const method = options?.method || 'GET';
  if (res.status === 404 && (method === 'GET' || method === 'DELETE')) return null;
  if (!res.ok) throw new Error(`MockAPI lỗi ${res.status}\n${options?.method || 'GET'} ${url}`);
  return res.json();
}

const fetchRecords = async () => (await request(VIDEOS)) || [];

export async function getVideos() {
  const records = await fetchRecords();
  return records.map(r => ({
    id: r.videoId,
    title: r.title,
    added: Number(r.added) || Date.parse(r.createdAt) || 0
  }));
}

// Đồng bộ danh sách hiện tại lên MockAPI: xóa bản ghi thừa, thêm mới, cập nhật tiêu đề đổi.
export async function saveVideos(list, onProgress) {
  const records = await fetchRecords();
  const byVideoId = new Map(records.map(r => [r.videoId, r]));
  const wanted = new Set(list.map(v => v.id));
  const jobs = [];

  for (const r of records) {
    if (!wanted.has(r.videoId)) {
      jobs.push(() => request(`${VIDEOS}/${r.id}`, { method: 'DELETE' }));
    }
  }

  for (const v of list) {
    const body = JSON.stringify({ videoId: v.id, title: v.title, added: v.added });
    const existing = byVideoId.get(v.id);
    if (!existing) {
      jobs.push(() => request(VIDEOS, { method: 'POST', body }));
    } else if (existing.title !== v.title || Number(existing.added) !== v.added) {
      jobs.push(() => request(`${VIDEOS}/${existing.id}`, { method: 'PUT', body }));
    }
  }

  console.log(`[saveVideos] Hiện có ${records.length} bản ghi trên API, cần thực hiện ${jobs.length} thao tác`);

  // Chạy lần lượt để tránh MockAPI từ chối khi nhận quá nhiều request cùng lúc.
  let done = 0;
  onProgress?.(0, jobs.length);
  for (const job of jobs) {
    await job();
    done += 1;
    onProgress?.(done, jobs.length);
    console.log(`[saveVideos] ${done}/${jobs.length}`);
  }
}
