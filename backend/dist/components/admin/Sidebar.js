"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Sidebar;
function Sidebar() {
    const menuItems = [
        { name: "Dashboard", path: "/admin" },
        { name: "Users", path: "/admin/users" },
        { name: "Wallets", path: "/admin/wallets" },
        { name: "Rewards", path: "/admin/rewards" },
        { name: "Payments", path: "/admin/payments" },
    ];
    return (<div style={{ padding: "20px" }}>
      <h2 style={{ marginBottom: "30px", fontSize: "20px" }}>Admin Panel</h2>
      <nav>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {menuItems.map((item) => (<li key={item.path} style={{ marginBottom: "15px" }}>
              <a href={item.path} style={{ color: "#fff", textDecoration: "none" }}>
                {item.name}
              </a>
            </li>))}
        </ul>
      </nav>
    </div>);
}
