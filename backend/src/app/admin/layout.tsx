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

import AdminLayout from "../components/admin/AdminLayout";
import StatCard from "../components/admin/StatCard";

export default function Dashboard() {
  return (
    <AdminLayout>
      <h1 style={{ marginBottom: "20px" }}>Dashboard Overview</h1>
      
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "20px" 
      }}>
        <StatCard title="Total Users" value="1,250" />
        <StatCard title="Total Revenue" value="$45,000" />
        <StatCard title="Active Wallets" value="890" />
      </div>
    </AdminLayout>
  );
}