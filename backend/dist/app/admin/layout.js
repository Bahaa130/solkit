"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AdminLayout;
exports.default = Dashboard;
const Sidebar_1 = __importDefault(require("./Sidebar"));
const Topbar_1 = __importDefault(require("./Topbar"));
function AdminLayout({ children }) {
    return (<div style={{
            display: "flex",
            minHeight: "100vh",
            background: "#f5f7fb",
        }}>
      <aside style={{
            width: "260px",
            background: "#111827",
            color: "#fff",
            flexShrink: 0,
        }}>
        <Sidebar_1.default />
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Topbar_1.default />
        <main style={{ padding: "24px" }}>{children}</main>
      </div>
    </div>);
}
const AdminLayout_1 = __importDefault(require("../components/admin/AdminLayout"));
const StatCard_1 = __importDefault(require("../components/admin/StatCard"));
function Dashboard() {
    return (<AdminLayout_1.default>
      <h1 style={{ marginBottom: "20px" }}>Dashboard Overview</h1>
      
      <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "20px"
        }}>
        <StatCard_1.default title="Total Users" value="1,250"/>
        <StatCard_1.default title="Total Revenue" value="$45,000"/>
        <StatCard_1.default title="Active Wallets" value="890"/>
      </div>
    </AdminLayout_1.default>);
}
