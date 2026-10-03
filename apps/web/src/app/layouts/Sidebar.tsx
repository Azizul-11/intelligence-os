import { useEffect, useRef, useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { type ChatConversation, useChatHistory } from "@/modules/workspace/stores/chat-history.store";

type SidebarProps = {
  open: boolean;
};

const GROUP_LABELS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;
type GroupLabel = (typeof GROUP_LABELS)[number];

function groupByRecency(conversations: ChatConversation[]): { label: GroupLabel; items: ChatConversation[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime();

  const buckets: Record<GroupLabel, ChatConversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const conversation of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const label: GroupLabel =
      conversation.updatedAt >= todayStart
        ? "Today"
        : conversation.updatedAt >= yesterdayStart
          ? "Yesterday"
          : conversation.updatedAt >= weekStart
            ? "Previous 7 days"
            : "Older";
    buckets[label].push(conversation);
  }

  return GROUP_LABELS.filter((label) => buckets[label].length > 0).map((label) => ({ label, items: buckets[label] }));
}

export function Sidebar({ open }: SidebarProps) {
  const navigate = useNavigate();
  const match = useMatch("/chat/:conversationId");
  const activeId = match?.params.conversationId;
  const conversations = useChatHistory((state) => state.conversations);
  const deleteConversation = useChatHistory((state) => state.deleteConversation);

  const [pendingDelete, setPendingDelete] = useState<ChatConversation | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const groups = groupByRecency(Object.values(conversations));

  useEffect(() => {
    if (pendingDelete && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [pendingDelete]);

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteConversation(pendingDelete.id);
    if (pendingDelete.id === activeId) navigate("/chat");
    dialogRef.current?.close();
  }

  return (
    <>
      <aside
        aria-label="Chat history"
        inert={!open}
        className={cn("overflow-hidden transition-all duration-200", open ? "w-64 border-r p-4" : "w-0 p-0")}
      >
        <div className="flex h-full w-56 flex-col gap-4">
          <button
            type="button"
            onClick={() => navigate("/chat")}
            className="inline-flex h-11 w-full shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" aria-hidden="true" />
            New chat
          </button>

          <nav aria-label="Saved chats" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {groups.length === 0 && (
              <p className="px-3 text-sm text-muted-foreground">No chats yet. Chats are saved in this browser only.</p>
            )}

            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <p className="px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
                <ul className="flex flex-col gap-1">
                  {group.items.map((conversation) => (
                    <li key={conversation.id} className="flex items-center gap-1">
                      <NavLink
                        to={`/chat/${conversation.id}`}
                        title={conversation.title}
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-11 min-w-0 flex-1 items-center rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )
                        }
                      >
                        <span className="truncate">{conversation.title}</span>
                      </NavLink>
                      <button
                        type="button"
                        aria-label={`Delete ${conversation.title}`}
                        onClick={() => setPendingDelete(conversation)}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-chat-title"
        aria-describedby="delete-chat-description"
        onClose={() => setPendingDelete(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[min(calc(100vw-2rem),24rem)] rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-2">
            <h2 id="delete-chat-title" className="text-base font-semibold">
              Delete chat?
            </h2>
            <p id="delete-chat-description" className="text-sm text-muted-foreground">
              {pendingDelete ? `"${pendingDelete.title}" will be removed from this browser. This can't be undone.` : ""}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
