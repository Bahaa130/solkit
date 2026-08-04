import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fb",
      }}
    >
      <aside
        style={{
          width: "260px",
          background: "#111827",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        <Sidebar />
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main style={{ padding: "24px" }}>{children}</main>
      </div>
    </div>
  );
}