import React, { useState, useMemo } from 'react';

// --- (Interfaces sin cambios) ---
interface ItemRecepcion {
  id: number;
  nombre: string;
  cantidadSolicitada: number;
  cantidadRecibida: number; 
}

interface OrdenResumen {
  nroOrden: string;
  proveedor: string;
  fechaEntrega?: string;
  estado: string;
  observaciones?: string;
}

interface RecepcionPendienteProps {
  items: ItemRecepcion[];
  onRegistrar: (resultados: ResultadoRecepcion[]) => void;
  resumenOrden?: OrdenResumen;
}

interface ResultadoRecepcion {
  id: number;
  cantidadRecibida: number;
  incidencia: 'Falta' | 'Sobra' | 'OK';
  observaciones: string;
}
// --- (Fin de Interfaces) ---

const RecepcionesPendientes: React.FC<RecepcionPendienteProps> = ({ items, onRegistrar, resumenOrden }) => {
  

  const estadoInicialResultados = useMemo<ResultadoRecepcion[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        cantidadRecibida: item.cantidadSolicitada,
        incidencia: 'OK' as const,
        observaciones: '',
      })),
    [items]
  );

  const [resultados, setResultados] = useState<ResultadoRecepcion[]>(estadoInicialResultados);

  const handleChange = (
    idx: number,
    campo: keyof ResultadoRecepcion,
    valor: string | number
  ) => {
    setResultados(prevResultados => {
      const nuevosResultados = prevResultados.map((r, i) => {
        if (i === idx) {
          // Limitar cantidad recibida a rango válido [0, cantidadSolicitada]
          if (campo === 'cantidadRecibida') {
            const original = items[idx];
            const numVal = typeof valor === 'number' ? valor : Number(valor);
            const clamped = Math.max(0, numVal);
            return { ...r, cantidadRecibida: clamped };
          }
          return { ...r, [campo]: valor };
        }
        return r;
      });

      // Lógica de incidencia automática
      if (campo === 'cantidadRecibida') {
        const itemModificado = nuevosResultados[idx];
        const itemOriginal = items[idx];
        const cantidadSolicitada = itemOriginal.cantidadSolicitada;
        const cantidadRecibidaNum = Number(itemModificado.cantidadRecibida);

        let nuevaIncidencia: ResultadoRecepcion['incidencia'] = 'OK';
        if (cantidadRecibidaNum < cantidadSolicitada) {
          nuevaIncidencia = 'Falta';
        } else if (cantidadRecibidaNum === cantidadSolicitada) {
          nuevaIncidencia = 'OK';
        } else if (cantidadRecibidaNum > cantidadSolicitada) {
          nuevaIncidencia = 'Sobra';
        }
        itemModificado.incidencia = nuevaIncidencia;
      }
      
      return nuevosResultados;
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onRegistrar(resultados);
  };

  // Mensaje de error (estilo claro)
  if (!items || items.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto p-8 text-center text-red-700 bg-red-50 border border-red-300 rounded-xl mt-8">
        <p className="font-semibold"><b>Depuración:</b> No se recibieron ítems para esta orden.</p>
        <pre className="text-xs text-left text-gray-700 bg-gray-100 p-2 mt-2 rounded">{JSON.stringify(items, null, 2)}</pre>
      </div>
    );
  }

  // Fondo azul marino, sin layout propio, número de orden centrado
  return (
    <div className="w-full min-h-screen py-8 px-2 sm:px-0 bg-blue-900 flex flex-col items-center">
      {/* Resumen de la orden */}
      {resumenOrden && (
        <section className="mb-6 p-6 rounded-lg bg-white/90 border border-blue-900 shadow-md w-full max-w-2xl">
          <div className="flex flex-col items-center gap-2 mb-3">
            <div className="text-blue-900 text-2xl font-bold bg-blue-100 px-6 py-3 rounded-xl shadow text-center">Nº Orden: {resumenOrden.nroOrden}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-base">
            <div className="text-blue-900"><span className="font-semibold">Proveedor:</span> {resumenOrden.proveedor}</div>
            <div className="text-blue-900"><span className="font-semibold">Fecha de Entrega:</span> {resumenOrden.fechaEntrega || '-'}</div>
            <div className="text-blue-900"><span className="font-semibold">Estado:</span> {resumenOrden.estado}</div>
          </div>
          {resumenOrden.observaciones && (
            <div className="text-blue-800 text-sm mt-2 text-center"><span className="font-semibold">Observaciones:</span> {resumenOrden.observaciones}</div>
          )}
        </section>
      )}

      {/* Formulario de recepción */}
      <form onSubmit={handleSubmit} className="bg-white/90 p-6 sm:p-8 rounded-lg shadow-md border border-blue-900 w-full max-w-2xl">
        <h2 className="text-xl font-semibold mb-6 text-blue-900 text-center">Registrar Recepción</h2>
        <div className="flex flex-col gap-5">
          {items.map((item, idx) => (
            <div key={item.id} className="border border-blue-200 rounded-lg p-4 bg-blue-50 flex flex-col gap-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <div className="font-semibold text-blue-900 text-lg">{item.nombre}</div>
                <div className="text-blue-800 text-sm">
                  Cantidad esperada: <span className="font-bold">{item.cantidadSolicitada}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <label className="flex flex-col space-y-1">
                  <span className="text-sm font-medium text-blue-900">Cantidad recibida</span>
                  <input
                    type="number"
                    min={0}
                    value={resultados[idx].cantidadRecibida}
                    onChange={e => handleChange(idx, 'cantidadRecibida', Number(e.target.value))}
                    className="w-full md:w-28 px-3 py-2 border border-blue-300 rounded-md bg-white text-blue-900 text-center font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </label>
                <label className="flex flex-col space-y-1">
                  <span className="text-sm font-medium text-blue-900">Estado</span>
                  <select
                    value={resultados[idx].incidencia}
                    onChange={e => handleChange(idx, 'incidencia', e.target.value as ResultadoRecepcion['incidencia'])}
                    className="w-full md:w-28 px-3 py-2 border border-blue-300 rounded-md bg-white text-blue-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="OK">OK</option>
                    <option value="Falta">Falta</option>
                    <option value="Sobra">Sobra</option>
                  </select>
                </label>
                <label className="flex-1 flex flex-col space-y-1 md:col-span-3 lg:col-span-1">
                  <span className="text-sm font-medium text-blue-900">Observaciones</span>
                  <input
                    type="text"
                    value={resultados[idx].observaciones}
                    onChange={e => handleChange(idx, 'observaciones', e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-md bg-white text-blue-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Observaciones..."
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          type="submit"
          className="mt-8 w-full sm:w-auto bg-blue-700 hover:bg-blue-800 text-white px-8 py-2.5 rounded-md font-bold shadow-md transition-colors duration-150 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Registrar Recepción
        </button>
      </form>
    </div>
  );
};

export default RecepcionesPendientes;