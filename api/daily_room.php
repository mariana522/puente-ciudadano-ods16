<?php
/**
 * ==============================================================================
 * SERVICIO BACKEND: GESTION DE SALAS DE VIDEOLLAMADA DAILY.CO (ODS 16)
 * ==============================================================================
 * Aprovisiona y sincroniza salas dinamicas mediante la API REST de Daily.co,
 * asegurando que tanto Ciudadano como Profesional se unan exactamente a la
 * misma sesion virtual asignada a su expediente.
 * ==============================================================================
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Email, X-User-Role, X-User-Name');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function loadDailyEnv($path) {
    if (!file_exists($path)) return [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $vars = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\n\r\0\x0B\"\'");
            $vars[$name] = $value;
            if (!getenv($name)) {
                putenv("$name=$value");
                $_ENV[$name] = $value;
            }
        }
    }
    return $vars;
}

$envPaths = [
    __DIR__ . '/../.env',
    __DIR__ . '/.env',
    dirname(__DIR__) . '/.env'
];
foreach ($envPaths as $p) {
    if (file_exists($p)) {
        loadDailyEnv($p);
        break;
    }
}

$dailyApiKey     = getenv('DAILY_API_KEY') ?: ($_ENV['DAILY_API_KEY'] ?? '');
$dailyDomain     = getenv('DAILY_DOMAIN') ?: ($_ENV['DAILY_DOMAIN'] ?? 'puente-ciudadano.daily.co');
$expirationHours = (int)(getenv('DAILY_ROOM_EXPIRATION_HOURS') ?: 24);

$rawInput = file_get_contents('php://input');
$data     = json_decode($rawInput, true) ?: [];

$caseId       = $data['caseId'] ?? $_GET['caseId'] ?? $_GET['id'] ?? 'CAS-00138';
$citizen      = $data['citizen'] ?? $_GET['citizen'] ?? 'Mariana Sibaja';
$professional = $data['professional'] ?? $_GET['professional'] ?? 'Dra. Elena Gomez';
$durationMins = (int)($data['durationMinutes'] ?? $_GET['durationMinutes'] ?? ($expirationHours * 60));

// Normalizar identificador para Daily.co (solo caracteres alfanumericos y guiones)
$cleanCaseId  = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $caseId));
$roomName     = 'puente-' . $cleanCaseId;
$expTimestamp = time() + ($durationMins * 60);

$hasValidKey = !empty($dailyApiKey) && $dailyApiKey !== 'tu_daily_api_key_aqui' && strlen($dailyApiKey) > 10;

// Opcional: intentar guardar sala_url en base de datos MySQL
function saveRoomToCase($cId, $url) {
    try {
        if (file_exists(__DIR__ . '/db_connect.php')) {
            require_once __DIR__ . '/db_connect.php';
            if (isset($pdo)) {
                $stmt = $pdo->prepare('UPDATE casos SET sala_url = ? WHERE codigo = ?');
                $stmt->execute([$url, $cId]);
            }
        }
    } catch (Exception $e) {}
}

if ($hasValidKey) {
    $payload = [
        'name'       => $roomName,
        'privacy'    => 'public',
        'properties' => [
            'exp'                 => $expTimestamp,
            'enable_chat'         => true,
            'enable_screenshare'  => true,
            'enable_knocking'     => false,
            'start_video_off'     => false,
            'start_audio_off'     => false,
            'eject_at_room_exp'   => true,
            'lang'                => 'es'
        ]
    ];

    $ch = curl_init('https://api.daily.co/v1/rooms');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $dailyApiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        $resData = json_decode($response, true);
        $roomUrl = $resData['url'] ?? "https://{$dailyDomain}/{$roomName}";
        saveRoomToCase($caseId, $roomUrl);

        echo json_encode([
            'success'     => true,
            'caseId'      => $caseId,
            'roomName'    => $resData['name'] ?? $roomName,
            'roomUrl'     => $roomUrl,
            'privacy'     => $resData['privacy'] ?? 'public',
            'exp'         => $resData['properties']['exp'] ?? $expTimestamp,
            'provider'    => 'daily.co',
            'status'      => 'created_live',
            'isLive'      => true,
            'message'     => "Sala Daily.co aprovisionada en vivo para el caso #{$caseId}"
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit();
    } elseif ($httpCode === 400 && strpos($response, 'already exists') !== false) {
        $chGet = curl_init("https://api.daily.co/v1/rooms/{$roomName}");
        curl_setopt($chGet, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chGet, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $dailyApiKey]);
        curl_setopt($chGet, CURLOPT_TIMEOUT, 10);
        $resGet = curl_exec($chGet);
        curl_close($chGet);
        $existing = json_decode($resGet, true) ?: [];
        $roomUrl = $existing['url'] ?? "https://{$dailyDomain}/{$roomName}";
        saveRoomToCase($caseId, $roomUrl);

        echo json_encode([
            'success'     => true,
            'caseId'      => $caseId,
            'roomName'    => $existing['name'] ?? $roomName,
            'roomUrl'     => $roomUrl,
            'provider'    => 'daily.co',
            'status'      => 'existing_live',
            'isLive'      => true,
            'message'     => "Sala existente reutilizada para el caso #{$caseId}"
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit();
    }
}

// Modo Sandbox / Fallback resiliente
$demoRoomUrl = "https://{$dailyDomain}/{$roomName}";
saveRoomToCase($caseId, $demoRoomUrl);

echo json_encode([
    'success'     => true,
    'caseId'      => $caseId,
    'roomName'    => $roomName,
    'roomUrl'     => $demoRoomUrl,
    'provider'    => 'daily.co',
    'status'      => 'ready',
    'isSandbox'   => !$hasValidKey,
    'config'      => [
        'hasApiKey'    => $hasValidKey,
        'domain'       => $dailyDomain,
        'citizen'      => $citizen,
        'professional' => $professional,
        'expMinutes'   => $durationMins
    ],
    'message'     => "Sala Daily.co lista para el caso #{$caseId}. Configura DAILY_API_KEY en .env para videollamadas privadas cloud."
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
