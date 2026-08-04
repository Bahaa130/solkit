import { useEffect, useMemo, useState } from "react";
import AdminLayout from "./components/admin/AdminLayout";

type User = {
  id: number;
  email: string;
  walletAddress: string | null;
  referralCode: string;
  referrerId: number | null;
  createdAt: string;
  updatedAt: string;
};

export default function Dashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
  const loadData = async () => {
    try {
      const res = await fetch("http://localhost:4000/api/dashboard");
      if (!res.ok) throw new Error("Failed to load data");

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users ?? []);
      setError("");
    } catch {
      setError("تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  loadData();
}, []);
  const stats = useMemo(
    () => ({
      total: users.length,
      withWallet: users.filter((u) => u.walletAddress).length,
      withReferrer: users.filter((u) => u.referrerId !== null).length,
    }),
    [users]
  );

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));

  return (
    <AdminLayout>
      <div className="min-h-full bg-gradient-to-b from-slate-50 to-indigo-50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              إدارة وعرض بيانات المستخدمين بشكل أنيق
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard label="إجمالي المستخدمين" value={stats.total} color="border-blue-500 text-blue-600" />
          <StatCard label="لديهم Wallet" value={stats.withWallet} color="border-green-500 text-green-600" />
          <StatCard label="لديهم Referrer" value={stats.withReferrer} color="border-violet-500 text-violet-600" />
        </div>

        {loading && <p className="my-3 font-medium text-slate-700">جاري التحميل...</p>}
        {error && <p className="my-3 font-medium text-red-600">{error}</p>}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">قائمة المستخدمين</h2>
            </div>

            {users.length === 0 ? (
              <p className="p-6 text-slate-500">لا توجد بيانات لعرضها الآن</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-sm text-slate-500">
                      <Th>ID</Th>
                      <Th>Email</Th>
                      <Th>Wallet</Th>
                      <Th>Referral Code</Th>
                      <Th>Referrer ID</Th>
                      <Th>Created At</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-t border-slate-200 transition hover:bg-slate-50">
                        <Td>#{user.id}</Td>
                        <Td>{user.email}</Td>
                        <Td>{user.walletAddress || ", "}</Td>
                        <Td>
                          <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                            {user.referralCode}
                          </span>
                        </Td>
                        <Td>{user.referrerId ?? ", "}</Td>
                        <Td>{formatDate(user.createdAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-2xl border-t-4 bg-white p-5 shadow-lg ${color}`}>
      <div className="mb-2 text-3xl font-extrabold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-600">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap border-t border-slate-200 px-4 py-4 text-sm text-slate-800">{children}</td>;
}