"use client";

import { BookOpenIcon, PhoneCall } from "lucide-react";
import { useAuth } from "./providers/auth-provider";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { ModeToggle } from "./mode-toggle";
import Link from "next/link";

export function Navbar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    const [activeIndex, setActiveIndex] = useState(0);
    const [indicatorStyle, setIndicatorStyle] = useState({});
    const navRef = useRef<HTMLDivElement>(null);

    const navItems = [
        { href: "/", label: "Home" },
        { href: "/inventario", label: "Inventario" },
        { href: "/procesos", label: "Procesos" },
        { href: "/produccion", label: "Producción" },
    ];

    useEffect(() => {
        const newActiveIndex = navItems.findIndex(
            (item) => item.href === pathname
        );
        setActiveIndex(newActiveIndex);
    }, [pathname]);

    useEffect(() => {
        if (navRef.current) {
            const activeButton = navRef.current.children[
                activeIndex
            ] as HTMLElement;
            if (activeButton) {
                setIndicatorStyle({
                    width: `${activeButton.offsetWidth}px`,
                    transform: `translateX(${activeButton.offsetLeft}px)`,
                });
            }
        }
    }, [activeIndex]);

    return (
        <nav className="relative z-50 shadow-md border-b dark:border-gray-700">
            <div className="container mx-auto px-6 py-3 flex justify-between items-center space-x-4">
                <div className="space-x-2 relative" ref={navRef}>
                    {navItems.map((item, index) => (
                        <Button
                            key={item.href}
                            variant="ghost"
                            className={`
                                relative z-10 transition-colors duration-200
                                ${
                                    pathname === item.href
                                        ? "text-white hover:text-white hover:bg-transparent"
                                        : "hover:text-black "
                                }
                            `}
                            asChild
                        >
                            <Link href={item.href}>{item.label}</Link>
                        </Button>
                    ))}
                    <div
                        className="absolute bottom-0 -left-0 h-full bg-blue-700 transition-all duration-300 ease-in-out z-0 rounded-md"
                        style={indicatorStyle}
                    />
                </div>
                <div className="space-x-4 flex items-center">
                    <Button className="bg-blue-600 hover:bg-blue-800">
                        Manual del Usuario
                        <BookOpenIcon
                            className="w-5 h-5 ml-2"
                            aria-hidden="true"
                        />
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-800">
                        Soporte
                        <PhoneCall
                            className="w-5 h-5 ml-2"
                            aria-hidden="true"
                        />
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
