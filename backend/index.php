<?php
/**
 * ==============================================================================
 * API GATEWAY & STATUS
 * Proyecto: Plataforma ODS 16 - Puente de Orientación Ciudadana
 * ==============================================================================
 */
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

echo json_encode([
    'name'        => 'API Puente Ciudadano - ODS 16',
    'version'     => '1.0.0',
    'status'      => 'online',
    'description' => 'Servicios de orientación jurídica y ciudadana (ODS 16: Paz, Justicia e Instituciones Sólidas)',
    'endpoints'   => [
        'GET  /backend/test_connection.php'     => 'Verificar estado de conexión MySQL',
        'POST /backend/auth.php?action=login'   => 'Autenticación de ciudadanos y profesionales',
        'POST /backend/auth.php?action=register'=> 'Registro de nuevos usuarios',
        'GET  /backend/casos.php'               => 'Listado general de casos y expedientes',
        'GET  /backend/casos.php?id=CAS-XXX'    => 'Detalle de un caso específico',
        'POST /backend/casos.php'               => 'Crear nuevo expediente de orientación',
        'POST /backend/casos.php?action=update' => 'Actualizar estado del caso o seguimiento'
    ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
