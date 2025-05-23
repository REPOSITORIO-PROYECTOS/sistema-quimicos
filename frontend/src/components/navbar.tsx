"use client";

import { BookOpenIcon, ChevronDown } from "lucide-react";
import { useAuth } from "./providers/auth-provider"; // Asegúrate que la ruta es correcta
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { ModeToggle } from "./mode-toggle"; // Asegúrate que la ruta es correcta
import Link from "next/link";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Definición de roles
type UserRole = "ADMIN" | "ALMACEN" | "VENTAS_LOCAL" | "VENTAS_PEDIDOS" | "CONTABLE" | "GUEST";

interface NavItemConfig {
    href: string;
    label: string;
    roles: UserRole[];
    isDropdown?: boolean;
    subItems?: NavItemConfig[];
}

// Configuración de los items de navegación
const navItemsConfig: NavItemConfig[] = [
    {
        href: "/",
        label: "Home",
        roles: ["ADMIN"], // CAMBIO: Solo ADMIN puede ver Home
    },
    {
        href: "/acciones",
        label: "Ventas",
        roles: ["ADMIN", "VENTAS_LOCAL", "VENTAS_PEDIDOS"],
        isDropdown: true,
        subItems: [
            { href: "/acciones", label: "Pedidos", roles: ["ADMIN", "VENTAS_PEDIDOS"] },
            { href: "/acciones-puerta", label: "Puerta", roles: ["ADMIN", "VENTAS_LOCAL"] },
        ],
    },
    { href: "/lista", label: "Lista", roles: ["ADMIN"] },
    { href: "/compras", label: "Compras", roles: ["ADMIN", "ALMACEN"] },
    { href: "/movimientos", label: "Movimientos", roles: ["ADMIN", "CONTABLE"] },
    { href: "/proveedores-acciones", label: "Proveedores", roles: ["ADMIN", "ALMACEN"] },
];

type IndicatorStyle = {
    width?: string;
    transform?: string;
    opacity?: number;
};

export function Navbar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    
    // Obtener usuario de sessionStorage
    const userItem: string | null = typeof window !== "undefined" ? sessionStorage.getItem("user") : null;
    const user = userItem ? JSON.parse(userItem) : null;
    // Asegúrate que la propiedad del rol en tu objeto user sea 'role'
    const userRole = (user?.role as UserRole) || "GUEST";

    const [indicatorStyle, setIndicatorStyle] = useState<IndicatorStyle>({});
    const navRef = useRef<HTMLDivElement>(null);

    const currentNavItems = useMemo(() => {
        if (userRole === "GUEST") {
            // GUEST no ve ningún item de esta lista por defecto,
            // ya que Home ahora es solo para ADMIN.
            // Si GUEST debe ver algo específico, añádelo a navItemsConfig con rol "GUEST"
            // y ajusta este filtro o elimina esta condición if para que se aplique la lógica general.
            return [];
        }

        return navItemsConfig.reduce((acc, item) => {
            // ADMIN siempre tiene acceso si el item está en la lista general
            // Para otros roles, verifica si su rol está incluido en item.roles
            const canAccessItem = userRole === "ADMIN" || item.roles.includes(userRole);

            if (canAccessItem) {
                if (item.isDropdown && item.subItems) {
                    const visibleSubItems = item.subItems.filter(
                        (sub) => userRole === "ADMIN" || sub.roles.includes(userRole)
                    );
                    if (visibleSubItems.length > 0) {
                        acc.push({ ...item, subItems: visibleSubItems });
                    }
                } else if (!item.isDropdown) {
                    acc.push(item);
                }
            }
            return acc;
        }, [] as NavItemConfig[]);
    }, [userRole]);


    useEffect(() => {
        // Solo ejecutar en el cliente
        if (typeof window === "undefined" || !navRef.current || currentNavItems.length === 0) {
            // Si no hay items o no estamos en el cliente, ocultar indicador
            if (indicatorStyle.opacity !== 0 || indicatorStyle.width !== '0px') {
                 setIndicatorStyle({ opacity: 0, width: '0px' });
            }
            return;
        }
        
        let activeElement: HTMLElement | null = null;
        const children = Array.from(navRef.current.children) as HTMLElement[];
        let activeItemConfigIndex = -1;

        if (pathname.startsWith('/acciones')) {
            activeItemConfigIndex = currentNavItems.findIndex(item => item.label === 'Ventas');
        } else {
            activeItemConfigIndex = currentNavItems.findIndex(item => item.href === pathname);
        }
        
        if (activeItemConfigIndex !== -1 && children[activeItemConfigIndex]) {
            activeElement = children[activeItemConfigIndex];
        }

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
                 width: '0px',
             };
        }

        const currentStyleValues = `${indicatorStyle.width || ''}-${indicatorStyle.transform || ''}-${indicatorStyle.opacity ?? 0}`;
        const newStyleValues = `${newStyle.width || ''}-${newStyle.transform || ''}-${newStyle.opacity ?? 0}`;

        if (currentStyleValues !== newStyleValues) {
             setIndicatorStyle(newStyle);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, currentNavItems]); // No incluyas indicatorStyle aquí para evitar bucles si la comparación es simple
                                     // Si la comparación de estilos es compleja y necesitas el valor previo, sí debes incluirlo

    // Si no hay usuario (y por ende es GUEST y currentNavItems está vacío)
    // podrías querer renderizar una Navbar diferente o solo los botones de la derecha
    // if (!user) {
    // // Por ejemplo, no mostrar la barra de navegación izquierda si es GUEST y no hay items para él
    // }

    return (
        <nav className="relative z-50 shadow-md border-b dark:border-gray-700">
            <div className="container mx-auto px-6 py-3 flex justify-between items-center space-x-4">
                <div className="space-x-2 relative flex items-center" ref={navRef}>
                    {currentNavItems.map((item) => {
                        if (item.isDropdown && item.subItems && item.subItems.length > 0) {
                            const isVentasActive = item.subItems.some(sub => pathname === sub.href) || 
                                                  (pathname.startsWith(item.href) && item.href !== "/"); // Evitar que "/" active "Ventas" si href es "/acciones"
                            return (
                                <DropdownMenu key={item.href}>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            data-trigger-for="ventas"
                                            className={`relative z-10 transition-colors duration-200 flex items-center gap-1 ${
                                                isVentasActive ? "text-white hover:text-white bg-transparent" : "hover:text-black dark:hover:text-white"
                                            }`}
                                        >
                                            {item.label}
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        {item.subItems.map((subItem) => (
                                            <DropdownMenuItem key={subItem.href} asChild>
                                                <Link href={subItem.href}>{subItem.label}</Link>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            );
                        } else if (!item.isDropdown) {
                            const isActive = pathname === item.href;
                            return (
                                <Button
                                    key={item.href}
                                    variant="ghost"
                                    data-href={item.href}
                                    className={`relative z-10 transition-colors duration-200 ${
                                        isActive ? "text-white hover:text-white bg-transparent" : "hover:text-black dark:hover:text-white"
                                    }`}
                                    asChild
                                >
                                    <Link href={item.href}>{item.label}</Link>
                                </Button>
                            );
                        }
                        return null;
                    })}
                    {currentNavItems.length > 0 && (
                         <div
                            className="absolute bottom-0 left-0 h-full bg-blue-700 transition-all duration-300 ease-in-out z-0 rounded-md pointer-events-none"
                            style={{ ...indicatorStyle, transition: 'transform 0.3s ease-in-out, width 0.3s ease-in-out, opacity 0.3s ease-in-out' }}
                        />
                    )}
                </div>
                
                {/* Botones de la derecha, podrías condicionarlos también si es necesario */}
                {user && ( // Mostrar estos botones solo si hay un usuario logueado
                    <div className="space-x-4 flex items-center">
                        <Button className="bg-blue-600 hover:bg-blue-800 hidden md:inline-flex">
                            Manual del Usuario
                            <BookOpenIcon className="w-5 h-5 ml-2" aria-hidden="true" />
                        </Button>
                        <Button
                            asChild
                            className="bg-blue-600 hover:bg-blue-800 hidden md:inline-flex"
                        >
                            <a
                                href="https://wa.me/542646281854"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Soporte
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                logout(); // Llama al logout del contexto
                                if (typeof window !== "undefined") {
                                    sessionStorage.removeItem("user"); // Limpia sessionStorage
                                    // Opcionalmente, redirige al login:
                                    // window.location.href = '/login';
                                }
                            }}
                            className="text-sm font-semibold hover:bg-red-500 hover:text-white"
                        >
                            Cerrar sesión
                        </Button>
                        <ModeToggle />
                    </div>
                )}
                 {!user && ( // Ejemplo: Mostrar solo ModeToggle si no hay usuario
                    <div className="flex items-center">
                         <ModeToggle />
                         {/* Podrías poner un botón de Login aquí */}
                    </div>
                 )}
            </div>
        </nav>
    );
}