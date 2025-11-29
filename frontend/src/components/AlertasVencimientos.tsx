"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type OrdenPendiente = {
  id: number;
  nro: string;
  proveedor: string;
  estado: string;
  fecha_creacion: string;
  fecha_aprobacion: string;
  fecha_vencimiento: string;
  dias_restantes: number;
  prioridad: "critico" | "alto" | "medio" | "bajo";
  importe_total_estimado: number;
  importe_abonado: number;
  deuda: number;
  forma_pago: string;
};

const formatCurrency = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v);

export default function AlertasVencimientos() {
  const [data, setData] = useState<OrdenPendiente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("https://quimex.sistemataup.online/reportes/ordenes-pendientes-vencimientos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(e.error || `Error ${res.status}`);
      }
      const json = await res.json();
      setData(json.ordenes_pendientes || []);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = data.slice().sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
    if (!q) return base;
    return base.filter((o) =>
      [o.nro, o.proveedor, o.estado, o.forma_pago].some((f) => (f || "").toLowerCase().includes(q))
    );
  }, [data, query]);

  const badgeVariant = (p: OrdenPendiente["prioridad"]) => {
    if (p === "critico") return "destructive" as const;
    if (p === "alto") return "default" as const;
    if (p === "medio") return "secondary" as const;
    return "outline" as const;
  };

  const exportCSV = () => {
    const headers = [
      "Nro",
      "Proveedor",
      "Estado",
      "Fecha Creación",
      "Fecha Aprobación",
      "Fecha Vencimiento",
      "Días Restantes",
      "Importe Total",
      "Importe Abonado",
      "Deuda",
      "Forma de Pago",
    ];
    const rows = filtered.map((o) => [
      o.nro,
      o.proveedor,
      o.estado,
      o.fecha_creacion,
      o.fecha_aprobacion,
      o.fecha_vencimiento,
      String(o.dias_restantes),
      String(o.importe_total_estimado),
      String(o.importe_abonado),
      String(o.deuda),
      o.forma_pago,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alertas_vencimientos_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const w = window.open("", "print");
    if (!w) return;
    const style = `
      <style>
        body{font-family: Arial; padding:20px}
        table{border-collapse:collapse; width:100%}
        th,td{border:1px solid #ccc; padding:6px; font-size:12px}
        th{background:#f2f2f2}
      </style>
    `;
    const head = [
      "Nro",
      "Proveedor",
      "Estado",
      "Vencimiento",
      "Días",
      "Deuda",
    ];
    const rows = filtered.map(
      (o) => `<tr><td>${o.nro}</td><td>${o.proveedor}</td><td>${o.estado}</td><td>${o.fecha_vencimiento}</td><td>${o.dias_restantes}</td><td>${formatCurrency(o.deuda)}</td></tr>`
    ).join("");
    w.document.write(`${style}<h3>Alertas de Vencimientos</h3><table><thead><tr>${head.map((h)=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Alertas de Vencimientos</h2>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Input placeholder="Buscar por nro, proveedor, estado..." value={query} onChange={(e)=>setQuery(e.target.value)} />
          <Button onClick={exportCSV}>Exportar CSV</Button>
          <Button variant="secondary" onClick={exportPDF}>Exportar PDF</Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Orden</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha Vencimiento</TableHead>
              <TableHead>Días</TableHead>
              <TableHead>Deuda</TableHead>
              <TableHead>Prioridad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7}>Cargando...</TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>Sin órdenes pendientes</TableCell>
              </TableRow>
            )}
            {filtered.map((o) => (
              <TableRow key={o.id} className="hover:bg-muted/50">
                <TableCell>{o.nro}</TableCell>
                <TableCell>{o.proveedor}</TableCell>
                <TableCell>{o.estado}</TableCell>
                <TableCell>{new Date(o.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}</TableCell>
                <TableCell className={o.dias_restantes <= 0 ? 'text-red-600 font-semibold' : ''}>{o.dias_restantes}</TableCell>
                <TableCell>{formatCurrency(o.deuda)}</TableCell>
                <TableCell><Badge variant={badgeVariant(o.prioridad)}>{o.prioridad}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

