// components/Header.tsx
import Image from "next/image";

export const Header = () => {
  return (
    <header className="bg-[#181065] py-2 px-4 flex items-center">
      <div className="relative h-8 w-32">
        <Image
          src="/logo.png"
          alt="Quimex Logo"
          fill
          className="object-contain"
        />
      </div>
    </header>
  );
};
