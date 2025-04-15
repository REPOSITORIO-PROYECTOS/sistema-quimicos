import TablaPersonalizada from "@/components/tabla-personalizada";
import React from "react";

export default function Page() {
    return (
        <main className="container mx-auto py-10">
            <h1 className="text-2xl font-bold mb-6">Tabla de inventario</h1>
            <TablaPersonalizada />
        </main>
    );
}
