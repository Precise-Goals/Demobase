import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const stripHtml = (value = "") =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export const Assist = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const [activeEditable, setActiveEditable] = useState("body");
  const [skipAutoSelect, setSkipAutoSelect] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [isReadMode, setIsReadMode] = useState(false);
  const [viewerNote, setViewerNote] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState("");

  const notesCollection = useMemo(() => collection(db, "notes"), [db]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get("note");
    const mode = params.get("mode");
    if (!viewId || mode !== "read") return;

    setIsReadMode(true);
    setViewerLoading(true);
    getDoc(doc(db, "notes", viewId))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          setViewerError("Note not found");
        } else {
          setViewerNote({ id: snapshot.id, ...snapshot.data() });
        }
      })
      .catch(() => setViewerError("Unable to load note"))
      .finally(() => setViewerLoading(false));
  }, [db]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setNotes([]);
        setActiveNoteId(null);
        setTitle("");
        setContent("");
        setSkipAutoSelect(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    setNotesLoading(true);
    const q = query(notesCollection, where("uid", "==", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextNotes = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) => {
            const aTime =
              typeof a.updatedAt?.toMillis === "function"
                ? a.updatedAt.toMillis()
                : 0;
            const bTime =
              typeof b.updatedAt?.toMillis === "function"
                ? b.updatedAt.toMillis()
                : 0;
            return bTime - aTime;
          });
        setNotes(nextNotes);
        setNotesLoading(false);
      },
      () => setNotesLoading(false)
    );

    return unsubscribe;
  }, [notesCollection, user]);

  useEffect(() => {
    const target = titleRef.current;
    if (!target) return;
    const nextValue = title || "";
    if (target.innerHTML !== nextValue) {
      target.innerHTML = nextValue;
    }
  }, [title]);

  useEffect(() => {
    const target = editorRef.current;
    if (!target) return;
    const nextValue = content || "";
    if (target.innerHTML !== nextValue) {
      target.innerHTML = nextValue;
    }
  }, [content]);

  const handleFormat = useCallback(
    (command) => {
      if (typeof document === "undefined") return;
      const target =
        activeEditable === "title" ? titleRef.current : editorRef.current;
      if (!target) return;
      target.focus();
      document.execCommand(command, false);
    },
    [activeEditable]
  );

  const handleContentChange = useCallback((event) => {
    setContent(event.currentTarget.innerHTML);
  }, []);

  const handleTitleChange = useCallback((event) => {
    setTitle(event.currentTarget.innerHTML);
  }, []);

  const handleEditorKeyDown = useCallback((event) => {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (typeof document !== "undefined") {
        document.execCommand("insertLineBreak");
      }
    }
  }, []);

  const handleAuth = useCallback(
    async (mode = "signin") => {
      if (!form.email || !form.password) {
        setAuthError("Enter email and password");
        return;
      }

      setAuthPending(true);
      setAuthError("");

      try {
        if (mode === "signin") {
          await signInWithEmailAndPassword(auth, form.email, form.password);
        } else {
          await createUserWithEmailAndPassword(auth, form.email, form.password);
        }
      } catch (error) {
        if (mode === "signin" && error.code === "auth/user-not-found") {
          setAuthError("No account found. Use Sign up.");
        } else if (
          mode === "signup" &&
          error.code === "auth/email-already-in-use"
        ) {
          setAuthError("Email already in use. Try Sign in.");
        } else {
          setAuthError(error.message ?? "Unable to authenticate");
        }
      } finally {
        setAuthPending(false);
      }
    },
    [form.email, form.password]
  );

  const handleSignOut = useCallback(() => {
    signOut(auth);
  }, []);

  const handleNewNote = useCallback(() => {
    setActiveNoteId(null);
    setTitle("");
    setContent("");
    setSaveMessage("");
    setSkipAutoSelect(true);
    editorRef.current?.focus();
  }, []);

  const handleSelectNote = useCallback((note) => {
    if (!note) return;
    setActiveNoteId(note.id);
    setTitle(note.title || "");
    setContent(note.content || "");
    setSaveMessage("");
    setSkipAutoSelect(false);
  }, []);

  useEffect(() => {
    if (skipAutoSelect) {
      return;
    }
    if (!activeNoteId && notes.length) {
      const firstNote = notes[0];
      setActiveNoteId(firstNote.id);
      setTitle(firstNote.title || "");
      setContent(firstNote.content || "");
      setSaveMessage("");
      setSkipAutoSelect(false);
    }
  }, [activeNoteId, notes, skipAutoSelect]);

  const canSave = useMemo(() => {
    if (!user) return false;
    return Boolean(stripHtml(title) || stripHtml(content));
  }, [content, title, user]);

  const handleSaveNote = useCallback(async () => {
    if (!user || !canSave) return;

    setIsSaving(true);
    setSaveMessage("Saving...");

    const plainTitle = stripHtml(title);
    const payload = {
      title: plainTitle ? title : "Untitled",
      content,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    };

    try {
      if (activeNoteId) {
        await setDoc(doc(db, "notes", activeNoteId), payload, { merge: true });
        setSaveMessage("Note updated");
      } else {
        const docRef = await addDoc(notesCollection, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setActiveNoteId(docRef.id);
        setSaveMessage("Draft saved");
      }
      setSkipAutoSelect(false);
    } catch (error) {
      setSaveMessage(error.message ?? "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [activeNoteId, canSave, content, db, notesCollection, title, user]);

  const shareUrl = useMemo(() => {
    if (!activeNoteId || typeof window === "undefined") return "";
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?note=${activeNoteId}&mode=read`;
  }, [activeNoteId]);

  const handleOpenViewer = useCallback(() => {
    if (!shareUrl || typeof window === "undefined") return;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }, [shareUrl]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Share link copied");
    } catch (error) {
      setShareMessage(error.message ?? "Copy failed");
    } finally {
      setTimeout(() => setShareMessage(""), 2500);
    }
  }, [shareUrl]);

  const handleExitReadMode = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = window.location.origin + window.location.pathname;
  }, []);

  const formatControls = useMemo(
    () => [
      { command: "bold", label: "B" },
      { command: "italic", label: "I" },
      { command: "underline", label: "U" },
      { command: "insertUnorderedList", label: "•" },
    ],
    []
  );

  const formatTimestamp = useCallback((timestamp) => {
    if (!timestamp) return "Just now";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }, []);

  if (isReadMode) {
    return (
      <section id="notes" className="note-view">
        <div className="note-view-card">
          <div className="note-view-header">
            <button className="ghost-btn" onClick={handleExitReadMode}>
              Back to workspace
            </button>
          </div>
          {viewerLoading && <p className="muted">Loading note...</p>}
          {viewerError && <p className="error-text">{viewerError}</p>}
          {viewerNote && (
            <>
              <h1
                className="note-view-title"
                dangerouslySetInnerHTML={{
                  __html: viewerNote.title || "Untitled",
                }}
              />
              <article
                className="note-view-body"
                dangerouslySetInnerHTML={{
                  __html: viewerNote.content || "",
                }}
              />
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="notes">
      <div className="notes-card">
        <header className="notes-header">
          <div>
            <p className="eyebrow">Lightweight Workspace</p>
            <h2>Notes you can trust</h2>
            <p className="subhead">
              Rich text editing with instant sync per account.
            </p>
          </div>
          {user && (
            <div className="user-chip">
              <span>{user.email}</span>
              <div className="chip-actions">
                <button
                  type="button"
                  className="chip-btn icon"
                  onClick={handleOpenViewer}
                  disabled={!activeNoteId}
                  aria-label="Open viewing link"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M8.5 15.5v2.25A1.25 1.25 0 0 0 9.75 19h8.5A1.25 1.25 0 0 0 19.5 17.75v-8.5A1.25 1.25 0 0 0 18.25 8h-2.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14 5h5m0 0v5m0-5L10 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="chip-btn icon subtle"
                  onClick={handleCopyLink}
                  disabled={!activeNoteId}
                  aria-label="Copy note URL"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M8.25 7.5v-2.25A1.5 1.5 0 0 1 9.75 3.75h8.25A1.5 1.5 0 0 1 19.5 5.25v8.25a1.5 1.5 0 0 1-1.5 1.5H15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15.75 7.5h-8.25A1.5 1.5 0 0 0 6 9v8.25A1.5 1.5 0 0 0 7.5 18.75h8.25a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="chip-btn icon danger"
                  aria-label="Sign out"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M15 7V5.25A1.25 1.25 0 0 0 13.75 4h-7A1.25 1.25 0 0 0 5.5 5.25v13.5A1.25 1.25 0 0 0 6.75 20h7A1.25 1.25 0 0 0 15 18.75V17"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20 12H10m10 0-3 3m3-3-3-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </header>
        {shareMessage && <p className="share-hint">{shareMessage}</p>}

        {!user ? (
          <form
            className="notes-auth"
            onSubmit={(event) => {
              event.preventDefault();
              handleAuth("signin");
            }}
          >
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
            <input
              type="password"
              placeholder="Create a password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
            {authError && <p className="error-text">{authError}</p>}
            <div className="auth-actions">
              <button type="submit" disabled={authPending}>
                {authPending ? "Working..." : "Sign in"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={authPending}
                onClick={() => handleAuth("signup")}
              >
                {authPending ? "Working..." : "Sign up"}
              </button>
            </div>
            <p className="auth-hint">
              Choose Sign in for existing accounts or Sign up to create one.
            </p>
          </form>
        ) : (
          <div className="notes-shell">
            <aside className="notes-sidebar">
              <div className="sidebar-head">
                <span>Recent notes</span>
                <button onClick={handleNewNote}>New</button>
              </div>
              <div className="notes-list">
                {notesLoading && <p className="muted">Loading notes...</p>}
                {!notesLoading && notes.length === 0 && (
                  <p className="muted">Start with a fresh idea ➜</p>
                )}
                {notes.map((note) => {
                  const preview = stripHtml(note.content || "").slice(0, 80);
                  const sidebarTitle =
                    stripHtml(note.title || "") || "Untitled";
                  const isActive = note.id === activeNoteId;
                  return (
                    <button
                      key={note.id}
                      className={isActive ? "note-row active" : "note-row"}
                      onClick={() => handleSelectNote(note)}
                    >
                      <strong>{sidebarTitle}</strong>
                      <span>{preview || "Draft"}</span>
                      <time>{formatTimestamp(note.updatedAt)}</time>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="notes-editor">
              <div
                className="notes-title"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Title your note"
                ref={titleRef}
                onInput={handleTitleChange}
                onFocus={() => setActiveEditable("title")}
              />

              <div className="editor-toolbar">
                {formatControls.map((control) => (
                  <button
                    key={control.command}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleFormat(control.command)}
                  >
                    {control.label}
                  </button>
                ))}
              </div>

              <div
                className="editor-content"
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Write something memorable"
                onInput={handleContentChange}
                onFocus={() => setActiveEditable("body")}
                onKeyDown={handleEditorKeyDown}
              />

              <div className="editor-footer">
                <button
                  className="primary"
                  onClick={handleSaveNote}
                  disabled={!canSave || isSaving}
                >
                  {isSaving ? "Saving" : activeNoteId ? "Update" : "Save draft"}
                </button>
                <span className="muted">{saveMessage}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
