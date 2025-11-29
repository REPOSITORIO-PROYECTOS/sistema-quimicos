"use client";
import { useEffect, useState } from "react";
import RecepcionesPendientes from "@/components/RecepcionesPendientes";

type OrdenCompra = {
  id: number;
  fecha_creacion: string;
  proveedor_nombre?: string;
  estado: string;
  proveedor_id?: number;
  iibb?: string;
  forma_pago?: string;
  cheque_perteneciente_a?: string;
  items?: { precio_unitario_estimado?: number }[];
};

type ItemRecepcion = {
  id: number;
  nombre: string;
  cantidadSolicitada: number;
  cantidadRecibida: number;
  productoCodigo?: string;
  costoUnitarioARS?: number;
};

export default function RecepcionesPendientesPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [itemsPorOrden, setItemsPorOrden] = useState<Record<number, {nombre: string, cantidad: number}[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenCompra | null>(null);
  const [items, setItems] = useState<ItemRecepcion[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    const fetchOrdenes = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Usuario no autenticado.");
        const url = `https://quimex.sistemataup.online/ordenes_compra/obtener_todas?estado=Aprobado`;
        const response = await fetch(url, {
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) {
          const errData = await response.json().catch(()=>({message:`Error ${response.status}`}));
          throw new Error(errData.message || "Error al traer órdenes.");
        }
        const data = await response.json();
        setOrdenes((data.ordenes || []).filter((o: OrdenCompra) => ['Aprobado','Con Deuda','EN_ESPERA_RECEPCION'].includes(String(o.estado))));
        // Mapear ítems por orden para mostrar en la lista
        const itemsMap: Record<number, {nombre: string, cantidad: number}[]> = {};
        (data.ordenes || []).forEach((orden: Record<string, unknown>) => {
          if (orden.items && Array.isArray(orden.items)) {
            itemsMap[Number(orden.id)] = (orden.items as Record<string, unknown>[]).map((item) => {
              let nombre = '';
              if (typeof item.producto_nombre === 'string') {
                nombre = item.producto_nombre;
              } else if (item.producto && typeof item.producto === 'object' && (item.producto as Record<string, unknown>).nombre) {
                nombre = (item.producto as Record<string, unknown>).nombre as string;
              } else if (item.producto_id) {
                nombre = `ID: ${item.producto_id}`;
              } else {
                nombre = 'Producto';
              }
              return { nombre, cantidad: item.cantidad_solicitada as number };
            });
          }
        });
        setItemsPorOrden(itemsMap);

        // Cargar también órdenes en estado 'Con Deuda' como pendientes de recepción
        try {
          const urlD = `https://quimex.sistemataup.online/ordenes_compra/obtener_todas?estado=Con%20Deuda`;
          const responseD = await fetch(urlD, {
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
          });
          if (responseD.ok) {
            const dataD = await responseD.json().catch(()=>({ordenes:[]}));
            setOrdenes(prev => [...prev, ...(dataD.ordenes || [])]);
            const itemsMapD: Record<number, {nombre: string, cantidad: number}[]> = {};
            (dataD.ordenes || []).forEach((orden: Record<string, unknown>) => {
              if (orden.items && Array.isArray(orden.items)) {
                itemsMapD[Number(orden.id)] = (orden.items as Record<string, unknown>[]).map((item) => {
                  let nombre = '';
                  if (typeof item.producto_nombre === 'string') {
                    nombre = item.producto_nombre;
                  } else if (item.producto && typeof item.producto === 'object' && (item.producto as Record<string, unknown>).nombre) {
                    nombre = (item.producto as Record<string, unknown>).nombre as string;
                  } else if (item.producto_id) {
                    nombre = `ID: ${item.producto_id}`;
                  } else {
                    nombre = 'Producto';
                  }
                  return { nombre, cantidad: item.cantidad_solicitada as number };
                });
              }
            });
            setItemsPorOrden(prev => ({...prev, ...itemsMapD}));
          }
        } catch {}
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message || 'Error desconocido.');
        } else {
          setError('Error desconocido.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchOrdenes();
  }, []);

  // Fetch items reales de la orden seleccionada
  useEffect(() => {
    if (!ordenSeleccionada) return;
    setLoadingItems(true);
    setItems(null);
    const fetchItems = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Usuario no autenticado.");
        const url = `https://quimex.sistemataup.online/ordenes_compra/obtener/${ordenSeleccionada.id}`;
        const response = await fetch(url, {
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Error al obtener ítems de la orden");
        const data = await response.json();
        const itemsBackend = (data.items || []).map((item: Record<string, unknown>) => ({
          id: item.id_linea as number,
          nombre:
            (typeof item.producto_nombre === 'string' && item.producto_nombre) ||
            (item.producto && typeof (item.producto as Record<string, unknown>).nombre === 'string' && (item.producto as Record<string, unknown>).nombre) ||
            (item.producto_id ? String(item.producto_id) : 'Producto'),
          cantidadSolicitada: item.cantidad_solicitada as number,
          cantidadRecibida: (item.cantidad_recibida as number) || 0,
          productoCodigo: typeof (item.producto_codigo as unknown) === 'string' ? (item.producto_codigo as string) : undefined,
          costoUnitarioARS: typeof (item.precio_unitario_estimado as unknown) === 'number' ? (item.precio_unitario_estimado as number) : undefined,
        }));
        setItems(itemsBackend);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message || 'Error obteniendo ítems.');
        } else {
          setError('Error obteniendo ítems.');
        }
      } finally {
        setLoadingItems(false);
      }
    };
    fetchItems();
  }, [ordenSeleccionada]);

  // Registrar recepción en backend y actualizar UI
  const registrarRecepcion = async (resultados: { id: number; cantidadRecibida: number; incidencia: 'Falta' | 'Sobra' | 'OK'; observaciones: string; }[]) => {
    try {
      const token = localStorage.getItem("token");
      const userItem = sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!token || !user) throw new Error("Usuario no autenticado.");

      const itemsRecibidos = resultados.map((res) => {
        const meta = items?.find(i => i.id === res.id);
        return {
          id_linea: res.id,
          cantidad_recibida: Number(res.cantidadRecibida) || 0,
          producto_codigo: meta?.productoCodigo || '',
          costo_unitario_ars: typeof meta?.costoUnitarioARS === 'number' ? meta?.costoUnitarioARS : 0,
          notas_item: res.observaciones || ''
        };
      });

      // Calcular estado final
      let estadoRecepcion: 'Completa' | 'Parcial' = 'Completa';
      for (const r of resultados) {
        const original = items?.find(i => i.id === r.id);
        if (!original || r.incidencia !== 'OK' || Number(r.cantidadRecibida) !== Number(original.cantidadSolicitada)) {
          estadoRecepcion = 'Parcial';
          break;
        }
      }

      // Calcular importe total recibido para deuda
      const importeTotal = itemsRecibidos.reduce((acc, it) => acc + (Number(it.cantidad_recibida) * Number(it.costo_unitario_ars)), 0);

      // Determinar un precio unitario razonable para registrar
      const precioUnitarioOC = Number(ordenSeleccionada?.items?.[0]?.precio_unitario_estimado ?? 0);
      const precioUnitarioRecepcion = precioUnitarioOC || (itemsRecibidos.length > 0 ? Number(itemsRecibidos[0].costo_unitario_ars) || 0 : 0);

      // Permitir ingresar monto abonado si tu UI lo soporta; por ahora usar total recibido
      const montoAbonado = importeTotal; // Ajusta si tienes un input específico

      const payload = {
        // Campos usados por backend para generar deuda y registrar recepción
        proveedor_id: ordenSeleccionada?.proveedor_id,
        cantidad: itemsRecibidos.reduce((acc, it) => acc + Number(it.cantidad_recibida), 0),
        precio_unitario: precioUnitarioRecepcion,
        importe_total: importeTotal,
        cuenta: '',
        iibb: ordenSeleccionada?.iibb || '',
        iva: '', // El backend no persiste IVA explícito en OC; usar observaciones si se requiere
        tc: '',
        nro_remito_proveedor: '',
        estado_recepcion: estadoRecepcion,
        importe_abonado: montoAbonado,
        forma_pago: ordenSeleccionada?.forma_pago || '',
        cheque_perteneciente_a: ordenSeleccionada?.cheque_perteneciente_a || '',
        tipo_caja: '',
        items_recibidos: itemsRecibidos,
      };

      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/recibir/${ordenSeleccionada?.id}` || '', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role,
          'X-User-Name' : user.usuario || user.name,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);

      alert('Recepción registrada correctamente.');
      setOrdenSeleccionada(null);

      // Refrescar lista base
      setLoading(true);
      setError(null);
      const url = `https://quimex.sistemataup.online/ordenes_compra/obtener_todas?estado=Aprobado`;
      const refresco = await fetch(url, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } });
      const nuevo = await refresco.json();
      setOrdenes((nuevo.ordenes || []).filter((o: OrdenCompra) => ['Aprobado','Con Deuda','EN_ESPERA_RECEPCION'].includes(String(o.estado))));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error registrando recepción.';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  if (ordenSeleccionada) {
    return (
      <div className="min-h-screen bg-blue-900 p-4 sm:p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl">
          <button className="mb-4 text-blue-100 underline flex items-center gap-1 hover:text-blue-300" onClick={() => setOrdenSeleccionada(null)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver a la lista
          </button>
          <h2 className="text-xl font-bold mb-2 text-blue-100 text-center">Recepción de Orden Nº {ordenSeleccionada.id.toString().padStart(4, '0')}</h2>
          <p className="mb-4 text-blue-200 text-center">Fecha: {new Date(ordenSeleccionada.fecha_creacion).toLocaleDateString("es-AR")}</p>
          {loadingItems && <p className="text-blue-100">Cargando ítems...</p>}
          {items && (
            <RecepcionesPendientes
              items={items}
              onRegistrar={registrarRecepcion}
              resumenOrden={{
                nroOrden: ordenSeleccionada.id.toString().padStart(4, '0'),
                proveedor: ordenSeleccionada.proveedor_nombre || '-',
                fechaEntrega:
                  typeof (ordenSeleccionada as Record<string, unknown>).fecha_entrega === 'string'
                    ? new Date((ordenSeleccionada as Record<string, unknown>).fecha_entrega as string).toLocaleDateString('es-AR')
                    : '-',
                estado: ordenSeleccionada.estado,
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-blue-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-blue-900">
          Recepciones Pendientes
        </h2>
        {loading && <p className="text-center text-gray-600 my-4 text-sm">Cargando órdenes aprobadas...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <ul className="space-y-2 divide-y divide-gray-200 min-w-[600px]">
              <li className="grid grid-cols-[1fr_2fr_2fr_2fr_3fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-sm text-gray-700 uppercase tracking-wider">
                <span>Nº Orden</span>
                <span>Fecha Solicitud</span>
                <span>Proveedor</span>
                <span>Ítems</span>
                <span className="text-center">Acción</span>
              </li>
              {ordenes.length === 0 ? (
                <li className="text-center py-8 text-gray-500 col-span-4">
                  No hay órdenes aprobadas pendientes de recepción.
                </li>
              ) : (
                ordenes.map(orden => (
                  <li key={orden.id} className="grid grid-cols-[1fr_2fr_2fr_2fr_3fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm">
                    <span className="font-semibold">{orden.id.toString().padStart(4, '0')}</span>
                    <span>{new Date(orden.fecha_creacion).toLocaleDateString("es-AR")}</span>
                    <span>{orden.proveedor_nombre || '-'}</span>
                    <span>
                      {Array.isArray(itemsPorOrden[orden.id]) && itemsPorOrden[orden.id].length > 0 ? (
                        <ul className="list-disc ml-3">
                          {itemsPorOrden[orden.id].map((item, idx) => (
                            <li key={idx}>{item.nombre} — Cantidad: {item.cantidad}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-400 italic">Sin ítems</span>
                      )}
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 flex items-center gap-1"
                        onClick={() => setOrdenSeleccionada(orden)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Ingresar Recepción
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
      <style jsx>{`
        .btn-pag { @apply px-4 py-2 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50 text-sm transition-colors; }
      `}</style>
    </div>
  );
}


