import React, { useEffect, useMemo, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Menu,
  Search,
  Mic,
  Plus,
  Video,
  Bell,
  House,
  Compass,
  Tv,
  Clapperboard,
  Music2,
  Library,
  Clock3,
  ThumbsUp,
  History,
  ListVideo,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  MoreVertical,
  Repeat,
  Download,
  Upload,
  Trash2,
  Copy,
} from "lucide-react";
import { getVideos, saveVideos, findDuplicates, deleteRecords } from "./api";
import "./style.css";

function getVideoId(value) {
  if (!value) return null;

  const text = String(value).trim();

  try {
    const u = new URL(text);

    if (u.hostname.includes("youtu.be"))
      return u.pathname.slice(1).split("/")[0];

    if (
      u.hostname.includes("youtube.com") ||
      u.hostname.includes("youtube-nocookie.com")
    ) {
      if (u.pathname === "/watch") return u.searchParams.get("v");

      const parts = u.pathname.split("/").filter(Boolean);

      if (["embed", "shorts", "live"].includes(parts[0])) return parts[1];
    }
  } catch {}

  return /^[\w-]{11}$/.test(text) ? text : null;
}

// Hàm lấy tiêu đề YouTube thực tế qua oEmbed API công khai
async function fetchYouTubeTitle(id) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        return data.title.trim();
      }
    }
  } catch {}
  return null;
}

function createBackupPayload(videoList) {
  return JSON.stringify(
    {
      app: "YouTube Peach Clone",
      version: 1,
      exportedAt: new Date().toISOString(),
      videos: videoList,
    },
    null,
    2,
  );
}

function App() {
  const [videos, setVideos] = useState([]);

  // Tải danh sách video từ MockAPI khi mở app.
  useEffect(() => {
    getVideos()
      .then((val) => {
        const list = val
          .map((v) => ({
            id: v.id,
            title: v.title || `Video YouTube · ${v.id}`,
            added: v.added,
          }))
          .sort((a, b) => b.added - a.added);
        videosRef.current = list;
        setVideos(list);
      })
      .catch((err) =>
        window.alert(`Không tải được dữ liệu.
${err.message}`),
      );
  }, []);

  const persist = (list) => {
    saveVideos(list).catch((err) =>
      window.alert(`Không thể lưu lên MockAPI.
${err.message}`),
    );
  };

  const [active, setActive] = useState(null);
  const [modal, setModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [player, setPlayer] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({
    done: 0,
    total: 0,
    label: "",
  });

  // Theo dõi có thêm/xóa video trong phiên hiện tại hay không
  const [hasListModified, setHasListModified] = useState(false);

  // Trạng thái toàn màn hình tùy biến giữ nguyên thanh điều khiển
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerShellRef = useRef(null);
  const restoredFileHandleRef = useRef(null);

  const videosRef = useRef(videos);
  const repeatRef = useRef(repeat);
  const restoreInputRef = useRef(null);
  const textFileInputRef = useRef(null);

  videosRef.current = videos;
  repeatRef.current = repeat;

  // Tắt Repeat khi chuyển sang video khác.
  useEffect(() => {
    setRepeat(false);
  }, [active?.id]);

  // Lắng nghe sự kiện thay đổi chế độ Fullscreen của trình duyệt
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Khởi tạo YouTube Player.
  useEffect(() => {
    if (!active) {
      setPlayer(null);
      setPlaying(false);
      setCurrent(0);
      setDuration(0);
      return;
    }

    let instance;
    let cancelled = false;

    const createPlayer = () => {
      if (cancelled || !window.YT?.Player) return;

      const videoId = active.id;

      instance = new window.YT.Player("yt-player", {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;

            const ytPlayer = e.target;

            setPlayer(ytPlayer);
            setDuration(ytPlayer.getDuration() || 0);
            setMuted(ytPlayer.isMuted?.() || false);

            const realTitle = ytPlayer.getVideoData()?.title?.trim();

            if (realTitle) {
              setActive((prev) =>
                prev?.id === videoId ? { ...prev, title: realTitle } : prev,
              );

              if (videosRef.current.some((v) => v.id === videoId)) {
                const updated = videosRef.current.map((v) =>
                  v.id === videoId ? { ...v, title: realTitle } : v,
                );
                videosRef.current = updated;
                setVideos(updated);
                persist(updated);
              }
            }

            ytPlayer.playVideo();
          },

          onStateChange: (e) => {
            const state = e.data;

            setPlaying(state === window.YT.PlayerState.PLAYING);

            if (state === window.YT.PlayerState.ENDED) {
              if (repeatRef.current) {
                e.target.seekTo(0);
                e.target.playVideo();
                return;
              }

              const available = videosRef.current.filter(
                (v) => v.id !== videoId,
              );

              if (available.length > 0) {
                const randomIndex = Math.floor(
                  Math.random() * available.length,
                );

                setActive(available[randomIndex]);
              } else {
                e.target.seekTo(0);
                e.target.playVideo();
              }
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      if (!document.querySelector("script[data-youtube-api]")) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.dataset.youtubeApi = "1";
        document.body.appendChild(script);
      }

      const previousCallback = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      try {
        instance?.destroy();
      } catch {}
    };
  }, [active?.id]);

  // Cập nhật thời gian phát.
  useEffect(() => {
    const timer = setInterval(() => {
      if (player?.getCurrentTime) {
        try {
          setCurrent(player.getCurrentTime() || 0);
          setDuration(player.getDuration() || 0);
        } catch {}
      }
    }, 500);

    return () => clearInterval(timer);
  }, [player]);

  // Phím tắt Space: phát / tạm dừng.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "Space" || e.repeat || !active || !player) return;

      const target = e.target;
      const tag = target?.tagName?.toLowerCase();

      if (
        ["input", "textarea", "select", "button", "a"].includes(tag) ||
        target?.isContentEditable ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey
      ) {
        return;
      }

      e.preventDefault();

      if (playing) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active?.id, player, playing]);

  // Hàm xử lý toàn màn hình giữ nguyên thanh điều khiển tùy chỉnh
  const toggleFullscreen = () => {
    if (!playerShellRef.current) return;

    if (!document.fullscreenElement) {
      playerShellRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Ghi nội dung vào FileSystemFileHandle (dùng khi lưu đè lên file JSON đã restore)
  const writeToHandle = async (handle, content) => {
    if (handle.queryPermission) {
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted" && handle.requestPermission) {
        const req = await handle.requestPermission({ mode: "readwrite" });
        if (req !== "granted") {
          throw new Error("Không được cấp quyền ghi file.");
        }
      }
    }

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  // Khi đóng video: nếu có thêm/bớt video thì hỏi có lưu đè vào file JSON đã restore không
  const handleCloseVideo = async () => {
    if (hasListModified) {
      const shouldSave = window.confirm(
        "Danh sách video đã có thay đổi (thêm/xóa). Bạn có muốn lưu thay đổi vào file JSON đã tải lên không?",
      );

      if (shouldSave) {
        try {
          const payload = createBackupPayload(videosRef.current);

          if (restoredFileHandleRef.current) {
            await writeToHandle(restoredFileHandleRef.current, payload);
            setHasListModified(false);
            window.alert("Đã lưu đè thay đổi vào file JSON.");
          } else if (typeof window.showSaveFilePicker === "function") {
            const date = new Date()
              .toISOString()
              .slice(0, 10)
              .replace(/-/g, "");

            const handle = await window.showSaveFilePicker({
              suggestedName: `peach-videos-backup-${date}.json`,
              types: [
                {
                  description: "JSON Files",
                  accept: { "application/json": [".json"] },
                },
              ],
            });

            restoredFileHandleRef.current = handle;
            await writeToHandle(handle, payload);
            setHasListModified(false);
            window.alert("Đã lưu danh sách vào file JSON.");
          } else {
            const blob = new Blob([payload], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const date = new Date()
              .toISOString()
              .slice(0, 10)
              .replace(/-/g, "");

            link.href = url;
            link.download = `peach-videos-backup-${date}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setHasListModified(false);
          }
        } catch (err) {
          if (err?.name !== "AbortError") {
            window.alert(
              `Không thể lưu file JSON.\n${err.message || "Đã xảy ra lỗi."}`,
            );
          }
        }
      }
    }

    setActive(null);
  };

  // Thêm nhiều video từ danh sách URL hoặc ID kèm lấy tiêu đề chuẩn hàng loạt
  const addVideosFromText = async (text) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setError("Vui lòng nhập danh sách video.");
      return;
    }

    const validIds = [];
    const invalid = [];

    lines.forEach((line) => {
      const id = getVideoId(line);

      if (id) {
        if (!validIds.includes(id)) {
          validIds.push(id);
        }
      } else {
        invalid.push(line);
      }
    });

    if (validIds.length === 0) {
      setError("Không tìm thấy URL hoặc ID YouTube hợp lệ.");
      return;
    }

    setIsAdding(true);
    setError("Đang lấy tiêu đề video từ YouTube...");

    const existing = videosRef.current;
    const knownIds = new Set(existing.map((v) => v.id));
    const newIdsToAdd = validIds.filter((id) => !knownIds.has(id));

    const fetchedPromises = newIdsToAdd.map(async (id, index) => {
      const realTitle = await fetchYouTubeTitle(id);
      return {
        id,
        title: realTitle || `Video YouTube · ${id}`,
        added: Date.now() + index,
      };
    });

    const addedVideos = await Promise.all(fetchedPromises);

    if (addedVideos.length > 0) {
      const updated = [...addedVideos, ...existing];
      videosRef.current = updated;
      setVideos(updated);
      persist(updated);
      setHasListModified(true);
    }

    setIsAdding(false);

    const firstId = validIds[0];
    const firstVideo =
      addedVideos.find((v) => v.id === firstId) ||
      existing.find((v) => v.id === firstId);

    if (firstVideo && !active) {
      setActive(firstVideo);
    }

    const duplicateCount = validIds.length - newIdsToAdd.length;
    const message = [
      `Đã thêm ${addedVideos.length} video mới.`,
      duplicateCount > 0 ? `Bỏ qua ${duplicateCount} video trùng.` : "",
      invalid.length > 0 ? `${invalid.length} dòng không hợp lệ.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    setError("");
    setBulkText("");
    setModal(false);

    if (invalid.length > 0 || duplicateCount > 0) {
      window.alert(message);
    }
  };

  const addVideo = (e) => {
    e.preventDefault();
    if (isAdding) return;
    addVideosFromText(bulkText);
  };

  const handleTextFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setBulkText(text);
      setError("");
    } catch {
      setError("Không thể đọc file TXT.");
    }

    e.target.value = "";
  };

  // Backup: tải file JSON về thư mục Downloads
  const backupVideos = async () => {
    if (!videosRef.current.length) {
      window.alert(
        "Danh sách video đang trống nên không có gì để backup. Kiểm tra lại kết nối MockAPI.",
      );
      return;
    }

    const payload = createBackupPayload(videosRef.current);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const defaultName = `peach-videos-backup-${date}.json`;

    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Xử lý nội dung JSON và thay thế hoàn toàn danh sách hiện tại (không gộp ngôn ngữ khác)
  const applyRestoredJsonText = async (text) => {
    console.log("[Restore] Đã đọc file, độ dài:", text.length, "ký tự");
    const data = JSON.parse(text);
    const imported = Array.isArray(data) ? data : data.videos;

    if (!Array.isArray(imported)) {
      throw new Error("File không chứa danh sách video hợp lệ.");
    }

    const seenIds = new Set();
    const replacedList = [];

    imported.forEach((item) => {
      if (!item || typeof item !== "object") return;

      const id = getVideoId(item.id || item.url);
      if (!id || seenIds.has(id)) return;

      seenIds.add(id);

      replacedList.push({
        id,
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : `Video YouTube · ${id}`,
        added: Number(item.added) || Date.now(),
      });
    });

    console.log(
      `[Restore] Trong file: ${imported.length} mục, hợp lệ: ${replacedList.length}, bỏ qua: ${imported.length - replacedList.length}`,
    );

    videosRef.current = replacedList;
    setVideos(replacedList);
    setActive(null);
    setHasListModified(false);

    setIsSyncing(true);
    setSyncProgress({ done: 0, total: 0, label: "Đang khôi phục dữ liệu" });
    console.log("[Restore] Bắt đầu lưu lên MockAPI...");
    const startedAt = Date.now();
    try {
      await saveVideos(replacedList, (done, total) =>
        setSyncProgress({ done, total, label: "Đang khôi phục dữ liệu" }),
      );
      console.log(`[Restore] Lưu MockAPI xong sau ${Date.now() - startedAt}ms`);
    } catch (err) {
      console.error("[Restore] Lưu MockAPI thất bại:", err);
      window.alert(
        `Đã hiển thị ${replacedList.length} video từ file JSON nhưng không lưu được lên MockAPI.\n${err.message}`,
      );
      return;
    } finally {
      setIsSyncing(false);
    }

    window.alert(
      `Khôi phục thành công!\n` +
        `Đã ghi đè dữ liệu cũ bằng ${replacedList.length} video từ file JSON và lưu lên MockAPI.`,
    );
  };

  // Mở hộp thoại chọn file JSON bằng input file thông thường
  const triggerRestoreJson = () => {
    console.log("[Restore] Click nút Restore, mở hộp chọn file");
    restoredFileHandleRef.current = null;
    restoreInputRef.current?.click();
  };

  const checkDuplicates = async () => {
    setIsSyncing(true);
    setSyncProgress({ done: 0, total: 0, label: "Đang kiểm tra video trùng" });

    let duplicates;
    try {
      duplicates = await findDuplicates();
    } catch (err) {
      window.alert(`Không thể kiểm tra dữ liệu trên MockAPI.\n${err.message}`);
      setIsSyncing(false);
      return;
    }
    setIsSyncing(false);

    if (!duplicates.length) {
      window.alert("Không có video nào bị trùng ID.");
      return;
    }

    const extras = duplicates.flatMap((d) => d.extras);
    const preview = duplicates
      .slice(0, 8)
      .map(
        (d) =>
          `• ${d.title || d.videoId} (${d.videoId}) - trùng ${d.extras.length + 1} lần`,
      )
      .join("\n");
    const more =
      duplicates.length > 8
        ? `\n... và ${duplicates.length - 8} video khác`
        : "";

    const ok = window.confirm(
      `Tìm thấy ${duplicates.length} video bị trùng ID (${extras.length} bản ghi thừa):\n\n${preview}${more}\n\n` +
        `Xóa ${extras.length} bản ghi thừa trên MockAPI (giữ lại 1 bản cho mỗi video)?`,
    );
    if (!ok) return;

    setIsSyncing(true);
    setSyncProgress({
      done: 0,
      total: extras.length,
      label: "Đang xóa video trùng",
    });
    try {
      await deleteRecords(extras, (done, total) =>
        setSyncProgress({ done, total, label: "Đang xóa video trùng" }),
      );
    } catch (err) {
      window.alert(`Không thể xóa video trùng.\n${err.message}`);
      return;
    } finally {
      setIsSyncing(false);
    }

    const seen = new Set();
    const unique = videosRef.current.filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
    videosRef.current = unique;
    setVideos(unique);
    window.alert(`Đã xóa ${extras.length} bản ghi trùng trên MockAPI.`);
  };

  const deleteAllVideos = async () => {
    if (!videosRef.current.length) {
      window.alert("Danh sách video đang trống.");
      return;
    }

    const ok = window.confirm(
      `Xóa toàn bộ ${videosRef.current.length} video?\nDữ liệu trên MockAPI cũng sẽ bị xóa. Hãy Backup trước nếu cần.`,
    );
    if (!ok) return;

    const previous = videosRef.current;

    setIsSyncing(true);
    setSyncProgress({ done: 0, total: 0, label: "Đang xóa dữ liệu" });
    try {
      await saveVideos([], (done, total) =>
        setSyncProgress({ done, total, label: "Đang xóa dữ liệu" }),
      );
    } catch (err) {
      window.alert(`Không thể xóa dữ liệu trên MockAPI.\n${err.message}`);
      return;
    } finally {
      setIsSyncing(false);
    }

    videosRef.current = [];
    setVideos([]);
    setActive(null);
    setHasListModified(false);
    restoredFileHandleRef.current = null;
    window.alert(`Đã xóa ${previous.length} video.`);
  };

  const restoreVideos = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("[Restore] Input file: chưa chọn file nào");
      return;
    }
    console.log("[Restore] Đã chọn file (input):", file.name);

    try {
      restoredFileHandleRef.current = null;
      const text = await file.text();
      await applyRestoredJsonText(text);
    } catch (err) {
      console.error("[Restore] Lỗi:", err);
      window.alert(
        `Không thể khôi phục dữ liệu.\n${err.message || "File JSON không hợp lệ."}`,
      );
    }

    e.target.value = "";
  };

  const filtered = useMemo(
    () =>
      videos.filter(
        (v) =>
          v.title.toLowerCase().includes(query.toLowerCase()) ||
          v.id.includes(query),
      ),
    [videos, query],
  );

  const recommendations = useMemo(
    () => filtered.filter((v) => v.id !== active?.id),
    [filtered, active?.id],
  );

  const fmt = (n) =>
    `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

  const seek = (e) => {
    const t = Number(e.target.value);
    setCurrent(t);
    player?.seekTo(t, true);
  };

  const remove = (id) => {
    const video = videosRef.current.find((v) => v.id === id);

    if (!video) return;

    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa video này không?\n\n${video.title}`,
    );

    if (!confirmed) return;

    const updated = videosRef.current.filter((v) => v.id !== id);

    videosRef.current = updated;
    setVideos(updated);
    persist(updated);
    setHasListModified(true);

    if (active?.id === id) setActive(null);
  };

  const toggleMute = () => {
    if (!player) return;

    if (muted) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  };

  return (
    <div className="app">
      {isSyncing && (
        <div className="sync-overlay" role="status" aria-live="polite">
          <div className="sync-box">
            <div className="sync-spinner" />
            <strong>{syncProgress.label}...</strong>
            {syncProgress.total > 0 && (
              <>
                <div className="sync-bar">
                  <div
                    className="sync-bar-fill"
                    style={{
                      width: `${(syncProgress.done / syncProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <span>
                  {syncProgress.done}/{syncProgress.total}
                </span>
              </>
            )}
            <small>Vui lòng không đóng tab.</small>
          </div>
        </div>
      )}

      <header className="topbar">
        <div className="brand-area">
          <button className="icon-btn" onClick={() => setSidebar(!sidebar)}>
            <Menu />
          </button>

          <div className="brand">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="93"
              height="20"
              viewBox="0 0 93 20"
              focusable="false"
              aria-label="YouTube"
              style={{ display: "block", fill: "currentcolor" }}
            >
              <path
                d="M14.4848 20C14.4848 20 23.5695 20 25.8229 19.4C27.0917 19.06 28.0459 18.08 28.3808 16.87C29 14.65 29 9.98 29 9.98C29 9.98 29 5.34 28.3808 3.14C28.0459 1.9 27.0917 0.94 25.8229 0.61C23.5695 0 14.4848 0 14.4848 0C14.4848 0 5.42037 0 3.17711 0.61C1.9286 0.94 0.954148 1.9 0.59888 3.14C0 5.34 0 9.98 0 9.98C0 9.98 0 14.65 0.59888 16.87C0.954148 18.08 1.9286 19.06 3.17711 19.4C5.42037 20 14.4848 20 14.4848 20Z"
                fill="#FF0033"
              />
              <path d="M19 10L11.5 5.75V14.25L19 10Z" fill="white" />
              <path d="M37.1384 18.8999V13.4399L40.6084 2.09994H38.0184L36.6984 7.24994C36.3984 8.42994 36.1284 9.65994 35.9284 10.7999H35.7684C35.6584 9.79994 35.3384 8.48994 35.0184 7.22994L33.7384 2.09994H31.1484L34.5684 13.4399V18.8999H37.1384Z" />
              <path d="M44.1003 6.29994C41.0703 6.29994 40.0303 8.04994 40.0303 11.8199V13.6099C40.0303 16.9899 40.6803 19.1099 44.0403 19.1099C47.3503 19.1099 48.0603 17.0899 48.0603 13.6099V11.8199C48.0603 8.44994 47.3803 6.29994 44.1003 6.29994ZM45.3903 14.7199C45.3903 16.3599 45.1003 17.3899 44.0503 17.3899C43.0203 17.3899 42.7303 16.3499 42.7303 14.7199V10.6799C42.7303 9.27994 42.9303 8.02994 44.0503 8.02994C45.2303 8.02994 45.3903 9.34994 45.3903 10.6799V14.7199Z" />
              <path d="M52.2713 19.0899C53.7313 19.0899 54.6413 18.4799 55.3913 17.3799H55.5013L55.6113 18.8999H57.6012V6.53994H54.9613V16.4699C54.6812 16.9599 54.0312 17.3199 53.4212 17.3199C52.6512 17.3199 52.4113 16.7099 52.4113 15.6899V6.53994H49.7812V15.8099C49.7812 17.8199 50.3613 19.0899 52.2713 19.0899Z" />
              <path d="M62.8261 18.8999V4.14994H65.8661V2.09994H57.1761V4.14994H60.2161V18.8999H62.8261Z" />
              <path d="M67.8728 19.0899C69.3328 19.0899 70.2428 18.4799 70.9928 17.3799H71.1028L71.2128 18.8999H73.2028V6.53994H70.5628V16.4699C70.2828 16.9599 69.6328 17.3199 69.0228 17.3199C68.2528 17.3199 68.0128 16.7099 68.0128 15.6899V6.53994H65.3828V15.8099C65.3828 17.8199 65.9628 19.0899 67.8728 19.0899Z" />
              <path d="M80.6744 6.26994C79.3944 6.26994 78.4744 6.82994 77.8644 7.73994H77.7344C77.8144 6.53994 77.8744 5.51994 77.8744 4.70994V1.43994H75.3244L75.3144 12.1799L75.3244 18.8999H77.5444L77.7344 17.6999H77.8044C78.3944 18.5099 79.3044 19.0199 80.5144 19.0199C82.5244 19.0199 83.3844 17.2899 83.3844 13.6099V11.6999C83.3844 8.25994 82.9944 6.26994 80.6744 6.26994ZM80.7644 13.6099C80.7644 15.9099 80.4244 17.2799 79.3544 17.2799C78.8544 17.2799 78.1644 17.0399 77.8544 16.5899V9.23994C78.1244 8.53994 78.7244 8.02994 79.3944 8.02994C80.4744 8.02994 80.7644 9.33994 80.7644 11.7299V13.6099Z" />
              <path d="M92.6517 11.4999C92.6517 8.51994 92.3517 6.30994 88.9217 6.30994C85.6917 6.30994 84.9717 8.45994 84.9717 11.6199V13.7899C84.9717 16.8699 85.6317 19.1099 88.8417 19.1099C91.3817 19.1099 92.6917 17.8399 92.5417 15.3799L90.2917 15.2599C90.2617 16.7799 89.9117 17.3999 88.9017 17.3999C87.6317 17.3999 87.5717 16.1899 87.5717 14.3899V13.5499H92.6517V11.4999ZM88.8617 7.96994C90.0817 7.96994 90.1717 9.11994 90.1717 11.0699V12.0799H87.5717V11.0699C87.5717 9.13994 87.6517 7.96994 88.8617 7.96994Z" />
            </svg>
            <sup>VN</sup>
          </div>
        </div>

        <div className="search-area">
          <form className="search-box" onSubmit={(e) => e.preventDefault()}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm"
            />
            <button type="submit" aria-label="Tìm kiếm">
              <Search />
            </button>
          </form>

          <button
            className="add-video"
            onClick={() => {
              setError("");
              setModal(true);
            }}
            title="Thêm video"
          >
            <Plus size={20} />
            <span>Thêm video</span>
          </button>

          <button
            className="header-tool"
            onClick={backupVideos}
            title="Backup dữ liệu"
          >
            <Download />
            <span>Backup</span>
          </button>

          <button
            className="header-tool"
            onClick={triggerRestoreJson}
            disabled={isSyncing}
            title="Restore dữ liệu"
          >
            <Upload />
            <span>{isSyncing ? "Đang lưu..." : "Restore"}</span>
          </button>

          <button
            className="header-tool"
            onClick={checkDuplicates}
            disabled={isSyncing}
            title="Kiểm tra video trùng ID"
          >
            <Copy />
            <span>Duplicate Check</span>
          </button>

          {/* <button
            className="header-tool"
            onClick={deleteAllVideos}
            disabled={isSyncing}
            title="Xóa toàn bộ dữ liệu"
          >
            <Trash2 />
            <span>Delete all</span>
          </button> */}

          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={restoreVideos}
          />

          <button className="icon-btn mic">
            <Mic />
          </button>
        </div>

        <div className="top-actions">
          <button className="icon-btn hide-small">
            <Video />
          </button>
          <button className="icon-btn hide-small">
            <Bell />
          </button>
        </div>
      </header>

      <aside className={`sidebar ${sidebar ? "" : "collapsed"}`}>
        <Nav icon={<House />} label="Home" active />
        <Nav icon={<Compass />} label="Explore" />
        <Nav icon={<Tv />} label="Subscriptions" />
        <div className="side-sep" />
        <Nav icon={<Clapperboard />} label="Originals" />
        <Nav icon={<Music2 />} label="Youtube Music" />
        <div className="side-sep" />
        <Nav icon={<Library />} label="Library" />
        <Nav icon={<History />} label="History" />
        <Nav icon={<ListVideo />} label="Your videos" />
        <Nav icon={<Clock3 />} label="Watch later" />
        <Nav icon={<ThumbsUp />} label="Liked videos" />
      </aside>

      <main className={`main ${sidebar ? "" : "wide"}`}>
        {active && (
          <div className="watch-layout">
            <section className="watch-view">
              <div ref={playerShellRef} className="player-shell">
                <div id="yt-player"></div>

                <div className="player-click-shield"></div>

                {!player && (
                  <div className="player-loading">
                    <Clapperboard size={42} />
                    <span>Đang tải video...</span>
                  </div>
                )}

                <div className="player-hover-controls">
                  <button
                    onClick={() => {
                      if (!player) return;
                      playing ? player.pauseVideo() : player.playVideo();
                    }}
                    title="Phát / Tạm dừng (Space)"
                  >
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                  </button>

                  <span className="time">
                    {fmt(current)} / {fmt(duration)}
                  </span>

                  <input
                    className="progress"
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={Math.min(current, duration || 100)}
                    onChange={seek}
                  />

                  <button
                    className={`repeat-btn ${repeat ? "active" : ""}`}
                    onClick={() => setRepeat((v) => !v)}
                    title={repeat ? "Tắt lặp video" : "Lặp video hiện tại"}
                  >
                    <Repeat size={18} />
                  </button>

                  <button
                    onClick={toggleMute}
                    title={muted ? "Bật âm thanh" : "Tắt âm thanh"}
                  >
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>

                  <button onClick={toggleFullscreen} title="Toàn màn hình">
                    <Maximize size={18} />
                  </button>
                </div>
              </div>

              <div className="video-heading">
                <h2>{active.title}</h2>
                <button
                  className="icon-btn"
                  onClick={handleCloseVideo}
                  title="Đóng video"
                >
                  <X />
                </button>
              </div>

              {repeat && (
                <p className="repeat-status">
                  <Repeat size={14} /> Đang bật lặp video hiện tại
                </p>
              )}
            </section>

            <aside className="recommendations">
              <h3>Video tiếp theo</h3>

              {recommendations.length > 0 ? (
                recommendations.map((v) => (
                  <article className="recommendation-card" key={v.id}>
                    <button
                      className="recommendation-thumb"
                      onClick={() => setActive(v)}
                    >
                      <img
                        src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                        alt=""
                      />
                      <span className="thumb-play">
                        <Play fill="white" />
                      </span>
                    </button>

                    <div className="recommendation-info">
                      <b>{v.title}</b>
                      <small>YouTube · {v.id}</small>
                    </div>

                    <button
                      className="more"
                      onClick={() => remove(v.id)}
                      title="Xóa video"
                    >
                      <MoreVertical />
                    </button>
                  </article>
                ))
              ) : (
                <p className="no-results">
                  Chưa có video khác trong danh sách.
                </p>
              )}
            </aside>
          </div>
        )}

        {!active && videos.length > 0 && (
          <section className="library-section">
            <div className="section-title">
              <h3>Video của bạn</h3>
              <span>{videos.length} video</span>
            </div>

            <div className="video-grid">
              {filtered.map((v) => (
                <article className="video-card" key={v.id}>
                  <button className="thumb" onClick={() => setActive(v)}>
                    <img
                      src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                      alt=""
                    />
                    <span className="thumb-play">
                      <Play fill="white" />
                    </span>
                  </button>

                  <div className="video-meta">
                    <div className="mini-avatar">▶</div>
                    <div className="video-info">
                      <b>{v.title}</b>
                      <small>YouTube · {v.id}</small>
                    </div>
                    <button
                      className="more"
                      onClick={() => remove(v.id)}
                      title="Xóa video"
                    >
                      <MoreVertical />
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {filtered.length === 0 && (
              <p className="no-results">Không tìm thấy video phù hợp.</p>
            )}
          </section>
        )}
      </main>

      {/* HỘP THÊM NHIỀU VIDEO */}
      {modal && (
        <div
          className="overlay"
          onMouseDown={(e) =>
            e.target === e.currentTarget && !isAdding && setModal(false)
          }
        >
          <form className="dialog bulk-dialog" onSubmit={addVideo}>
            <div className="dialog-head">
              <h2>Thêm video YouTube</h2>
              <button
                type="button"
                className="icon-btn"
                disabled={isAdding}
                onClick={() => setModal(false)}
              >
                <X />
              </button>
            </div>

            <label htmlFor="video-list">
              Dán danh sách URL hoặc ID YouTube
            </label>

            <textarea
              id="video-list"
              autoFocus
              disabled={isAdding}
              value={bulkText}
              onChange={(e) => {
                setBulkText(e.target.value);
                setError("");
              }}
              placeholder={
                "https://www.youtube.com/watch?v=VIDEO_ID_1\n" +
                "https://youtu.be/VIDEO_ID_2\n" +
                "VIDEO_ID_3"
              }
              rows={7}
            />

            <p className="input-hint">
              Mỗi video một dòng. Có thể dán nhiều URL hoặc ID cùng lúc.
            </p>

            <div className="file-import">
              <button
                type="button"
                className="secondary"
                disabled={isAdding}
                onClick={() => textFileInputRef.current?.click()}
              >
                <Upload size={16} /> Chọn file TXT
              </button>

              <input
                ref={textFileInputRef}
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={handleTextFile}
              />

              <span>File TXT sẽ được đưa vào ô nhập phía trên.</span>
            </div>

            {error && (
              <p className={`error ${isAdding ? "loading-text" : ""}`}>
                {error}
              </p>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                disabled={isAdding}
                onClick={() => setModal(false)}
              >
                Hủy
              </button>

              <button className="primary" type="submit" disabled={isAdding}>
                <Plus size={17} /> {isAdding ? "Đang thêm..." : "Thêm video"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Nav({ icon, label, active }) {
  return (
    <button className={`nav-item ${active ? "selected" : ""}`}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );
}

createRoot(document.getElementById("root")).render(<App />);
