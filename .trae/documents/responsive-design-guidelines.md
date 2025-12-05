# Lineamientos de Diseño Responsive - Sistema Químicos

## 1. Objetivos del Diseño Responsive

Este documento define los lineamientos para implementar un diseño responsive que garantice una experiencia óptima en dispositivos móviles, tablets y escritorio para el Sistema de Gestión Química.

### 1.1 Objetivos Principales

* Proporcionar acceso consistente a todas las funcionalidades del sistema en cualquier dispositivo

* Optimizar la experiencia de usuario para pantallas táctiles y de escritorio

* Mantener la legibilidad y usabilidad en todos los tamaños de pantalla

* Reducir el tiempo de carga en dispositivos móviles

## 2. Puntos de Ruptura (Breakpoints)

### 2.1 Definición de Breakpoints

```css
/* Mobile First Approach */
/* Móviles pequeños */
@media (min-width: 320px) { /* 320px - 767px */ }

/* Tablets */
@media (min-width: 768px) { /* 768px - 1023px */ }

/* Desktop pequeño */
@media (min-width: 1024px) { /* 1024px - 1279px */ }

/* Desktop grande */
@media (min-width: 1280px) { /* 1280px+ */ }
```

### 2.2 Breakpoints Específicos por Componente

* **Tablas de datos**: Cambiar a vista móvil a partir de 768px

* **Formularios complejos**: Ajustar layout a partir de 640px

* **Menú de navegación**: Cambiar a menú hamburguesa a partir de 1024px

* **Dashboard/Gráficos**: Ajustar tamaños a partir de 768px

## 3. Sistema de Tipografía

### 3.1 Escalado Tipográfico

```css
/* Móvil (320px - 767px) */
.text-xs { font-size: 0.75rem; }   /* 12px */
.text-sm { font-size: 0.875rem; }  /* 14px */
.text-base { font-size: 1rem; }    /* 16px */
.text-lg { font-size: 1.125rem; } /* 18px */
.text-xl { font-size: 1.25rem; }   /* 20px */

/* Tablet (768px+) */
@media (min-width: 768px) {
  .text-xs { font-size: 0.75rem; }   /* 12px */
  .text-sm { font-size: 0.875rem; }  /* 14px */
  .text-base { font-size: 1rem; }    /* 16px */
  .text-lg { font-size: 1.25rem; }   /* 20px */
  .text-xl { font-size: 1.5rem; }    /* 24px */
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  .text-xs { font-size: 0.75rem; }   /* 12px */
  .text-sm { font-size: 0.875rem; }  /* 14px */
  .text-base { font-size: 1rem; }    /* 16px */
  .text-lg { font-size: 1.375rem; }  /* 22px */
  .text-xl { font-size: 1.75rem; }   /* 28px */
}
```

### 3.2 Interlineado y Espaciado

* **Móvil**: line-height: 1.4, letter-spacing: 0.01em

* **Tablet**: line-height: 1.5, letter-spacing: 0.005em

* **Desktop**: line-height: 1.6, letter-spacing: normal

## 4. Sistema de Espaciado

### 4.1 Escala de Espaciado Responsive

```css
/* Sistema de espaciado basado en 8px */
/* Móvil */
.space-xs { margin: 0.25rem; }   /* 4px */
.space-sm { margin: 0.5rem; }    /* 8px */
.space-md { margin: 1rem; }      /* 16px */
.space-lg { margin: 1.5rem; }    /* 24px */
.space-xl { margin: 2rem; }      /* 32px */

/* Tablet (768px+) */
@media (min-width: 768px) {
  .space-xs { margin: 0.375rem; } /* 6px */
  .space-sm { margin: 0.75rem; }  /* 12px */
  .space-md { margin: 1.25rem; }  /* 20px */
  .space-lg { margin: 2rem; }     /* 32px */
  .space-xl { margin: 2.5rem; }   /* 40px */
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  .space-xs { margin: 0.5rem; }    /* 8px */
  .space-sm { margin: 1rem; }      /* 16px */
  .space-md { margin: 1.5rem; }   /* 24px */
  .space-lg { margin: 2.5rem; }   /* 40px */
  .space-xl { margin: 3rem; }      /* 48px */
}
```

### 4.2 Padding por Dispositivo

* **Móvil**: Container padding: 16px, Card padding: 12px

* **Tablet**: Container padding: 24px, Card padding: 16px

* **Desktop**: Container padding: 32px, Card padding: 20px

## 5. Patrones de Layout

### 5.1 Layout Principal

```css
/* Layout Base */
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
}

/* Móvil */
@media (max-width: 767px) {
  .container { max-width: 100%; }
  .sidebar { display: none; }
  .main-content { width: 100%; }
}

/* Tablet */
@media (min-width: 768px) and (max-width: 1023px) {
  .container { max-width: 750px; }
  .sidebar { width: 200px; }
  .main-content { width: calc(100% - 200px); }
}

/* Desktop */
@media (min-width: 1024px) {
  .container { max-width: 1200px; }
  .sidebar { width: 250px; }
  .main-content { width: calc(100% - 250px); }
}
```

### 5.2 Grid System Responsive

```css
.grid {
  display: grid;
  gap: 1rem;
}

/* Móvil: 1 columna */
@media (max-width: 767px) {
  .grid-cols-responsive { grid-template-columns: 1fr; }
}

/* Tablet: 2 columnas */
@media (min-width: 768px) and (max-width: 1023px) {
  .grid-cols-responsive { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop: 3-4 columnas */
@media (min-width: 1024px) {
  .grid-cols-responsive { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
}
```

## 6. Componentes Específicos

### 6.1 Tablas de Datos

```css
/* Móvil: Tablas convertidas a cards */
@media (max-width: 767px) {
  .data-table {
    display: block;
  }
  .data-table thead {
    display: none;
  }
  .data-table tr {
    display: block;
    margin-bottom: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .data-table td {
    display: block;
    text-align: right;
    padding: 0.5rem;
  }
  .data-table td::before {
    content: attr(data-label);
    float: left;
    font-weight: bold;
  }
}
```

### 6.2 Formularios

```css
/* Móvil: Campos apilados */
@media (max-width: 767px) {
  .form-row {
    flex-direction: column;
  }
  .form-group {
    width: 100%;
    margin-bottom: 1rem;
  }
}

/* Tablet+: Campos en línea */
@media (min-width: 768px) {
  .form-row {
    display: flex;
    gap: 1rem;
  }
  .form-group {
    flex: 1;
  }
}
```

### 6.3 Botones y Acciones

```css
/* Móvil: Botones touch-friendly */
@media (max-width: 767px) {
  .btn {
    min-height: 44px;
    min-width: 44px;
    font-size: 16px; /* Previene zoom en iOS */
  }
  .btn-group {
    flex-direction: column;
  }
}

/* Desktop: Botones más compactos */
@media (min-width: 1024px) {
  .btn {
    min-height: 36px;
    padding: 0.5rem 1rem;
  }
}
```

## 7. Optimización para Touch

### 7.1 Áreas de Touch

* **Mínimo**: 44px × 44px para elementos interactivos

* **Óptimo**: 48px × 48px para botones principales

* **Espaciado**: Mínimo 8px entre elementos interactivos

### 7.2 Gestos y Interacciones

```css
/* Optimización para touch */
@media (hover: none) and (pointer: coarse) {
  .touch-optimized {
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  
  /* Swipe indicators para móvil */
  .swipe-hint::after {
    content: "↔ Desliza para más opciones";
    font-size: 0.75rem;
    color: #6b7280;
    display: block;
    text-align: center;
    margin-top: 0.5rem;
  }
}
```

## 8. Performance Considerations

### 8.1 Imágenes Responsive

```css
/* Imágenes adaptativas */
.responsive-img {
  max-width: 100%;
  height: auto;
  display: block;
}

/* Imágenes para diferentes densidades */
@media (min-resolution: 2dppx) {
  .logo {
    background-image: url('logo@2x.png');
  }
}
```

### 8.2 Lazy Loading

```html
<!-- Implementación de lazy loading para imágenes -->
<img 
  src="placeholder.jpg" 
  data-src="producto.jpg" 
  loading="lazy"
  alt="Producto químico"
  class="responsive-img"
/>
```

## 9. Testing y Validación

### 9.1 Dispositivos de Prueba

* **Móviles**: iPhone SE (375px), iPhone 12 (390px), Samsung Galaxy S21 (360px)

* **Tablets**: iPad (768px), iPad Pro (1024px)

* **Desktop**: 1366px, 1920px

### 9.2 Herramientas de Testing

* Chrome DevTools Device Mode

* BrowserStack para testing cross-device

* Lighthouse para performance audit

## 10. Implementación en el Proyecto

### 10.1 Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      screens: {
        'xs': '320px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
      spacing: {
        'xs': '0.25rem',
        'sm': '0.5rem',
        'md': '1rem',
        'lg': '1.5rem',
        'xl': '2rem',
      }
    }
  }
}
```

### 10.2 Componentes React Responsive

```typescript
// Ejemplo de componente responsive
const ResponsiveTable = ({ data }) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  
  return (
    <div className={isMobile ? "mobile-table" : "desktop-table"}>
      {isMobile ? <MobileTable data={data} /> : <DesktopTable data={data} />}
    </div>
  );
};
```

## 11. Mantenimiento y Actualización

### 11.1 Revisión Periódica

* Revisar breakpoints cada 6 meses

* Actualizar según estadísticas de uso de dispositivos

* Ajustar basándose en feedback de usuarios

### 11.2 Documentación de Cambios

* Registrar todos los ajustes de responsive design

* Mantener changelog de optimizaciones

* Documentar problemas conocidos y soluciones

