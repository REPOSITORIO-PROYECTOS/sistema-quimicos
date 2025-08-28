"use client";

import React, { useEffect, useState } from 'react';
import Ticket, { VentaData } from '@/components/Ticket';

export default function PaginaDeImpresion() {
  const [printJob, setPrintJob] = useState<{ tipo: 'comprobante' | 'orden_de_trabajo', boletas: VentaData[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Escucha mensajes de la ventana que abrió esta
    function handleMessage(event: MessageEvent) {
      console.log('Mensaje recibido en imprimir:', event);
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'PRINT_JOB_DATA') {
        console.log('Datos de impresión recibidos:', event.data.payload);
        setPrintJob(event.data.payload);
        setIsLoading(false);
      }
    }
    window.addEventListener('message', handleMessage);
    const timeout = setTimeout(() => {
      setIsLoading(false);
      setError("No se encontraron datos para imprimir. Por favor, vuelve a la página anterior e inténtalo de nuevo.");
    }, 2000);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    // Cuando los datos estén listos y renderizados, llamar a imprimir
    if (printJob) {
      const timer = setTimeout(() => {
        window.print();
        // Opcional: puedes intentar cerrar la pestaña después de un tiempo
        // setTimeout(() => window.close(), 2000);
      }, 500); // Un retraso generoso para asegurar el renderizado
      return () => clearTimeout(timer);
    }
  }, [printJob]);

  if (isLoading) {
    return <p style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '2rem' }}>Preparando documentos para impresión...</p>;
  }

  if (error) {
    return <p style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '2rem', color: 'red' }}>{error}</p>;
  }

  if (!printJob || printJob.boletas.length === 0) {
  console.log('printJob en render:', printJob);

  // Fallback de depuración: mostrar los datos crudos si Ticket falla
  if (printJob && printJob.boletas && printJob.boletas.length > 0) {
    return (
      <div>
        <h2>DEBUG: Datos recibidos para imprimir</h2>
        {printJob.boletas.map((boleta, idx) => (
          <pre key={idx}>{JSON.stringify(boleta, null, 2)}</pre>
        ))}
      </div>
    );
  }
    return <p style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '2rem' }}>No hay documentos para imprimir.</p>;
  }

  // Fallback: mostrar siempre los datos crudos para depuración
  return (
    <div id="presupuesto-imprimible">
      {printJob.boletas.map((boleta, index) => (
        <React.Fragment key={boleta.venta_id}>
          <Ticket tipo={printJob.tipo} ventaData={boleta} />
          <div className="ticket-page-break" />
          <Ticket tipo={printJob.tipo} ventaData={boleta} />
          {/* Solo poner page break entre pares de boletas, no después del último par */}
          {index < printJob.boletas.length - 1 && <div className="ticket-page-break" />}
        </React.Fragment>
      ))}
    </div>
  );
}