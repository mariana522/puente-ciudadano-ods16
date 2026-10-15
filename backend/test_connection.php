<?php
/**
 * ==============================================================================
 * DIAGNOSTICO DE BASE DE DATOS RELACIONAL Y ESQUEMA 3FN
 * Proyecto: Plataforma ODS 16 - Puente de Orientacion Ciudadana
 * ==============================================================================
 */

require_once __DIR__ . '/db_connect.php';

try {
    $tables = [];
    if ($db_engine === 'sqlite') {
        $stmt = $pdo->query("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } else {
        $stmt = $pdo->query("SHOW TABLES");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    $usersCount = 0;
    $casesCount = 0;
    $msgsCount = 0;
    try {
        $usersCount = (int)$pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
        $casesCount = (int)$pdo->query("SELECT COUNT(*) FROM casos")->fetchColumn();
        $msgsCount  = (int)$pdo->query("SELECT COUNT(*) FROM mensajes")->fetchColumn();
    } catch (Exception $e) {}

    echo json_encode([
        'success'      => true,
        'motor'        => ($db_engine === 'sqlite') ? 'SQLite 3 (Relacional Local)' : 'MySQL / MariaDB (XAMPP)',
        'esquema'      => 'Tercera Forma Normal (3FN)',
        'ods_meta'     => 'ODS 16 - Paz, Justicia e Instituciones Solidas',
        'tablas_total' => count($tables),
        'tablas'       => $tables,
        'estadisticas' => [
            'usuarios' => $usersCount,
            'casos'    => $casesCount,
            'mensajes' => $msgsCount
        ],
        'mensaje'      => 'Conexion a base de datos relacional establecida con exito.'
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
