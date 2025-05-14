"use client";

import { BookOpenIcon, PhoneCall, ChevronDown } from "lucide-react";
import { useAuth } from "./providers/auth-provider";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { ModeToggle } from "./mode-toggle";
import Link from "next/link";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mover navItems FUERA del componente
const navItems = [
    { href: "/", label: "Home" },
    { href: "/acciones", label: "Ventas" },
    { href: "/lista", label: "Lista" },
   // { href: "/procesos", label: "Procesos" },
    { href: "/compras", label: "Compras" },
    {href: "/movimientos", label:"Movimientos"},
];

// --- SOLUCIÓN: Definir un tipo para el estilo del indicador ---
type IndicatorStyle = {
    width?: string;      // Puede tener width (string) o no
    transform?: string;  // Puede tener transform (string) o no
    opacity?: number;    // Puede tener opacity (number) o no
};

export function Navbar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    // --- SOLUCIÓN: Usar el tipo explícito en useState ---
    const [indicatorStyle, setIndicatorStyle] = useState<IndicatorStyle>({});
    const navRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (navRef.current) {
            let activeElement: HTMLElement | null = null;
            const children = Array.from(navRef.current.children) as HTMLElement[];

            if (pathname.startsWith('/acciones')) {
                activeElement = children.find(el => el.getAttribute('data-trigger-for') === 'ventas') || null;
            } else {
                const activeIndex = navItems.findIndex(item => item.href === pathname);
                if (activeIndex !== -1) {
                    activeElement = children[activeIndex] || null;
                }
            }

            // --- SOLUCIÓN: Usar el tipo explícito para la variable intermedia ---
            let newStyle: IndicatorStyle = {};
            if (activeElement) {
                newStyle = {
                    width: `${activeElement.offsetWidth}px`,
                    transform: `translateX(${activeElement.offsetLeft}px)`,
                    opacity: 1,
                };
            } else {
                 newStyle = {
                     opacity: 0,
                     width: '0px', // Mantenemos width para la comparación
                 };
            }

            // Comparación: Asegurarse de manejar undefined al crear las strings
            // Usamos || '' y || 0 para dar valores por defecto si la propiedad no existe
            const currentStyleValues = `${indicatorStyle.width || ''}-${indicatorStyle.transform || ''}-${indicatorStyle.opacity ?? 0}`;
            const newStyleValues = `${newStyle.width || ''}-${newStyle.transform || ''}-${newStyle.opacity ?? 0}`;

            if (currentStyleValues !== newStyleValues) {
                 setIndicatorStyle(newStyle);
            }
        }
    }, [pathname]); // navItems está fuera, solo depende de pathname

    return (
        <nav className="relative z-50 shadow-md border-b dark:border-gray-700">
            <div className="container mx-auto px-6 py-3 flex justify-between items-center space-x-4">
                <div className="space-x-2 relative flex items-center" ref={navRef}>
                    {navItems.map((item) => {
                        if (item.label === "Ventas") {
                            const isVentasActive = pathname.startsWith(item.href);
                            return (
                                <DropdownMenu key={item.href}>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            data-trigger-for="ventas"
                                            className={`relative z-10 transition-colors duration-200 flex items-center gap-1 ${isVentasActive ? "text-white hover:text-white bg-transparent" : "hover:text-black dark:hover:text-white"}`}
                                        >
                                            {item.label}
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem asChild>
                                            <Link href="/acciones">Pedidos</Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                            <Link href="/acciones-puerta">Puerta</Link>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            );
                        } else {
                            const isActive = pathname === item.href;
                            return (
                                <Button
                                    key={item.href}
                                    variant="ghost"
                                    className={`relative z-10 transition-colors duration-200 ${isActive ? "text-white hover:text-white bg-transparent" : "hover:text-black dark:hover:text-white"}`}
                                    asChild
                                >
                                    <Link href={item.href}>{item.label}</Link>
                                </Button>
                            );
                        }
                    })}
                    <div
                        className="absolute bottom-0 left-0 h-full bg-blue-700 transition-all duration-300 ease-in-out z-0 rounded-md pointer-events-none"
                        // Ahora el estilo se aplica directamente. TypeScript está contento.
                        style={{ ...indicatorStyle, transition: 'transform 0.3s ease-in-out, width 0.3s ease-in-out, opacity 0.3s ease-in-out' }}
                    />
                </div>
                <div className="space-x-4 flex items-center">
                   {/* Botones derechos ... */}
                   <Button className="bg-blue-600 hover:bg-blue-800 hidden md:inline-flex">
                        Manual del Usuario
                        <BookOpenIcon className="w-5 h-5 ml-2" aria-hidden="true" />
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-800 hidden md:inline-flex">
                        Soporte
                        <PhoneCall className="w-5 h-5 ml-2" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={logout}
                        className="text-sm font-semibold hover:bg-red-500 hover:text-white"
                    >
                        Cerrar sesión
                    </Button>
                    <ModeToggle />
                </div>
            </div>
        </nav>
    );
}