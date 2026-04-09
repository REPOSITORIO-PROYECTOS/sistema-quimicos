#!/bin/bash
# Test para comparar dashboards via HTTP
# NOTA: Necesita TOKEN válido

echo "======================================================================"
echo "TEST: Comparación de Dashboards via HTTP"
echo "======================================================================"

# Reemplaza con tu token actual
TOKEN="${QUIMEX_TOKEN:-tu_token_aqui}"

if [ "$TOKEN" = "tu_token_aqui" ]; then
    echo "ERROR: Debes establecer QUIMEX_TOKEN=<token_valido>"
    echo "Uso: QUIMEX_TOKEN='...' bash test_dashboards.sh"
    exit 1
fi

BASE_URL="https://quimex.sistemataup.online"
HOY=$(date +%Y-%m-%d)

echo "Base URL: $BASE_URL"
echo "Fecha: $HOY"
echo ""

# ==================== DASHBOARD PEDIDOS ====================
echo "1. Obteniendo Dashboard PEDIDOS (ventas-pedidos)..."
PEDIDOS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/dashboard/ventas-pedidos")

echo "Respuesta:"
echo "$PEDIDOS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PEDIDOS_RESPONSE"

PEDIDOS_PUERTA=$(echo "$PEDIDOS_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['hoy']['ingreso_puerta_hoy'])" 2>/dev/null)
PEDIDOS_PEDIDOS=$(echo "$PEDIDOS_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['hoy']['ingreso_pedidos_hoy'])" 2>/dev/null)
PEDIDOS_KGS=$(echo "$PEDIDOS_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['pendiente_entrega']['cantidad_kilos'])" 2>/dev/null)

echo ""
echo "Valores extraídos:"
echo "  Ingreso Puerta: $PEDIDOS_PUERTA"
echo "  Ingreso Pedidos: $PEDIDOS_PEDIDOS"
echo "  KGs: $PEDIDOS_KGS"

# ==================== DASHBOARD ADMIN ====================
echo ""
echo "2. Obteniendo Dashboard ADMIN (dashboard-kpis para fecha $HOY)..."
ADMIN_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/reportes/dashboard-kpis?fecha=$HOY")

echo "Respuesta (primeros 500 chars):"
echo "$ADMIN_RESPONSE" | head -c 500

echoadmin_PUERTA=$(echo "$ADMIN_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['primera_fila']['ingreso_puerta_hoy'])" 2>/dev/null)
ADMIN_PEDIDOS=$(echo "$ADMIN_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['primera_fila']['ingreso_pedido_hoy'])" 2>/dev/null)
ADMIN_KGS=$(echo "$ADMIN_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['primera_fila']['kgs_manana'])" 2>/dev/null)

echo ""
echo "Valores extraídos:"
echo "  Ingreso Puerta: $ADMIN_PUERTA"
echo "  Ingreso Pedidos: $ADMIN_PEDIDOS"
echo "  KGs: $ADMIN_KGS"

# ==================== COMPARACIÓN ====================
echo ""
echo "======================================================================"
echo "COMPARACIÓN"
echo "======================================================================"
echo ""
echo "                         PEDIDOS      ADMIN    DIFERENCIA"
echo "Ingreso Puerta:          $PEDIDOS_PUERTA     $ADMIN_PUERTA"
echo "Ingreso Pedidos:         $PEDIDOS_PEDIDOS     $ADMIN_PEDIDOS"
echo "KGs Mañana:              $PEDIDOS_KGS     $ADMIN_KGS"
echo ""
echo "======================================================================"
