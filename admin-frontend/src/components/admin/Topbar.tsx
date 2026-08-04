export default function Topbar() {
  return (
    <header
      style={{
        padding: "15px 24px",
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: "600" }}>Admin Dashboard</span>

      <button
        onClick={() => {
          console.log("Logout");
        }}
        style={{
          padding: "8px 16px",
          cursor: "pointer",
          border: "none",
          borderRadius: "6px",
          background: "#111827",
          color: "#fff",
        }}
      >
        Logout
      </button>
    </header>
  );
}