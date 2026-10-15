<?php
/**
 * ==============================================================================
 * CONEXION PDO A BASE DE DATOS RELACIONAL (MYSQL / MARIADB / SQLITE 3)
 * Proyecto: Plataforma ODS 16 - Puente de Orientacion Ciudadana
 * ==============================================================================
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User-Email, X-User-Role, X-User-Name');
header('Content-Type: application/json; charset=UTF-8');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$envPaths = [
    __DIR__ . '/../.env',
    __DIR__ . '/.env'
];

foreach ($envPaths as $envFile) {
    if (file_exists($envFile) && is_readable($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) continue;
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value, " \t\n\r\0\x0B\"\'");
                if (!getenv($key)) {
                    putenv("{$key}={$value}");
                    $_ENV[$key] = $value;
                }
            }
        }
        break;
    }
}

$host     = getenv('DB_HOST')     ?: '127.0.0.1';
$port     = getenv('DB_PORT')     ?: 3306;
$db_name  = getenv('DB_DATABASE') ?: 'puente_ciudadano';
$username = getenv('DB_USERNAME') ?: 'root';
$password = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '';

$pdo = null;
$db_engine = 'mysql';

// 1. Intento de conexion a MySQL / MariaDB (XAMPP)
try {
    $dsn = "mysql:host={$host};port={$port};dbname={$db_name};charset=utf8mb4";
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 2
    ]);
} catch (Exception $e) {
    // 2. Fallback resiliente a SQLite 3 (base de datos relacional local en 3FN)
    $sqlitePaths = [
        __DIR__ . '/../database/puente_ciudadano.sqlite',
        dirname(__DIR__) . '/database/puente_ciudadano.sqlite'
    ];
    foreach ($sqlitePaths as $sqPath) {
        if (file_exists($sqPath)) {
            try {
                $pdo = new PDO("sqlite:" . $sqPath, null, null, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]);
                $db_engine = 'sqlite';
                break;
            } catch (Exception $sqEx) {}
        }
    }

    if (!$pdo) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error'   => 'Error de conexion a base de datos relacional (MySQL / SQLite): ' . $e->getMessage(),
            'hint'    => 'Verifica que MySQL este iniciado en XAMPP o que database/puente_ciudadano.sqlite exista.'
        ]);
        exit();
    }
}
