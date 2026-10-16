<?php
/**
 * ==============================================================================
 * API REST DE CASOS CON ARQUITECTURA RELACIONAL 3FN Y AISLAMIENTO DE USUARIOS
 * Proyecto: Plataforma ODS 16 - Puente de Orientacion Ciudadana
 * ==============================================================================
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Email, X-User-Role, X-User-Name');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db_connect.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

function getRequestUser() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $email = $_GET['user_email'] ?? $_GET['userEmail'] ?? $headers['X-User-Email'] ?? $headers['x-user-email'] ?? '';
    $role  = $_GET['user_role'] ?? $_GET['userRole'] ?? $headers['X-User-Role'] ?? $headers['x-user-role'] ?? 'citizen';
    $name  = $_GET['user_name'] ?? $_GET['userName'] ?? $headers['X-User-Name'] ?? $headers['x-user-name'] ?? '';
    return [
        'email' => trim(strtolower($email)),
        'role'  => trim(strtolower($role)),
        'name'  => trim($name)
    ];
}

// Determinar tabla o vista relacional
$hasResumenView = false;
$sourceTable = 'casos';
try {
    $checkView = $pdo->query("SELECT 1 FROM vista_casos_resumen LIMIT 1");
    if ($checkView !== false) {
        $hasResumenView = true;
        $sourceTable = 'vista_casos_resumen';
    }
} catch (Exception $e) {
    $hasResumenView = false;
    $sourceTable = 'casos';
}

// Intentar crear la vista si existen las tablas relacionales normalizadas pero no la vista
if (!$hasResumenView) {
    try {
        $pdo->exec("CREATE OR REPLACE VIEW vista_casos_resumen AS
        SELECT 
            c.id AS caso_id,
            c.codigo AS codigo,
            u_c.id AS ciudadano_id,
            u_c.nombre AS ciudadano,
            u_c.correo AS correo_ciudadano,
            cat.nombre AS tipo,
            c.subtipo AS subtipo,
            c.descripcion AS descripcion,
            c.estado AS estado,
            COALESCE(u_p.nombre, 'Por asignar') AS profesional_asignado,
            u_p.id AS profesional_id,
            u_p.correo AS correo_profesional,
            c.fecha_radicacion AS fecha,
            inst.nombre AS institucion,
            inst.direccion AS direccion_institucion,
            inst.telefono AS telefono_institucion,
            inst.horario_atencion AS horario_institucion,
            COALESCE(c.sala_url, s.room_url) AS sala_url,
            ac.observaciones AS observaciones,
            c.creado_en AS creado_en,
            c.actualizado_en AS actualizado_en
        FROM casos c
        JOIN usuarios u_c ON c.ciudadano_id = u_c.id
        JOIN categorias_casos cat ON c.categoria_id = cat.id
        JOIN instituciones inst ON c.institucion_id = inst.id
        LEFT JOIN asignaciones_casos ac ON (ac.caso_id = c.id AND ac.activo = 1)
        LEFT JOIN usuarios u_p ON ac.profesional_id = u_p.id
        LEFT JOIN salas_videollamada s ON s.caso_id = c.id");
        $hasResumenView = true;
        $sourceTable = 'vista_casos_resumen';
    } catch (Exception $e) {
        $hasResumenView = false;
        $sourceTable = 'casos';
    }
}

try {
    // -------------------------------------------------------------------------
    // 1. GET: CONSULTAR CASO POR CODIGO O LISTAR CASOS AISLADOS
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $codigo = $_GET['codigo'] ?? $_GET['id'] ?? null;
        $reqUser = getRequestUser();
        $isUnassigned = isset($_GET['unassigned']) && ($_GET['unassigned'] === 'true' || $_GET['unassigned'] === '1');

        // A. Consultar caso individual
        if ($codigo) {
            $stmt = $pdo->prepare("SELECT * FROM {$sourceTable} WHERE codigo = ?");
            $stmt->execute([$codigo]);
            $caso = $stmt->fetch();

            if (!$caso) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => "Expediente {$codigo} no encontrado."]);
                exit();
            }

            // Validacion de aislamiento de datos: solo partes involucradas
            if (!empty($reqUser['email']) || !empty($reqUser['name'])) {
                $cEmail = strtolower($caso['correo_ciudadano'] ?? '');
                $cName  = strtolower($caso['ciudadano'] ?? '');
                $pName  = strtolower($caso['profesional_asignado'] ?? '');

                $isOwnerCitizen = ($reqUser['email'] && $reqUser['email'] === $cEmail) ||
                                  ($reqUser['name'] && strtolower($reqUser['name']) === $cName);
                $isAssignedProf = ($reqUser['name'] && strtolower($reqUser['name']) === $pName) ||
                                  ($pName === 'por asignar' || $pName === 'sin asignar');

                if (!$isOwnerCitizen && !$isAssignedProf) {
                    http_response_code(403);
                    echo json_encode([
                        'success' => false,
                        'error'   => 'Aislamiento de datos ODS 16: No tienes autorizacion para acceder a este expediente privado.'
                    ]);
                    exit();
                }
            }

            if (isset($caso['checklist']) && is_string($caso['checklist'])) {
                $caso['checklist'] = json_decode($caso['checklist'] ?: '[]', true);
            }
            echo json_encode(['success' => true, 'data' => $caso]);
            exit();
        }

        // B. Listado con aislamiento estricto segun el usuario y su rol
        if ($reqUser['role'] === 'professional') {
            if ($isUnassigned) {
                // Compatible tanto con vista_casos_resumen como con tabla casos (3FN y plana)
                if ($hasResumenView) {
                    $stmt = $pdo->query("SELECT * FROM vista_casos_resumen 
                        WHERE (profesional_asignado IS NULL OR profesional_asignado = 'Por asignar' OR profesional_asignado = 'Sin asignar') AND (profesional_id IS NULL OR profesional_id = 0) 
                        ORDER BY caso_id DESC");
                    $casos = $stmt->fetchAll();
                } else {
                    $hasColProf = false;
                    try {
                        $colCheck = $pdo->query("SHOW COLUMNS FROM casos LIKE 'profesional_asignado'");
                        $hasColProf = ($colCheck && $colCheck->rowCount() > 0);
                    } catch (Exception $e) {}

                    if ($hasColProf) {
                        $stmt = $pdo->query("SELECT * FROM casos 
                            WHERE (profesional_asignado IS NULL OR profesional_asignado = 'Por asignar' OR profesional_asignado = 'Sin asignar' OR LOWER(estado) = 'pendiente') 
                            ORDER BY id DESC");
                        $casos = $stmt->fetchAll();
                    } else {
                        // 3FN directa sin vista
                        $stmt = $pdo->query("SELECT c.*, c.id AS caso_id, 'Por asignar' AS profesional_asignado, NULL AS profesional_id 
                            FROM casos c 
                            LEFT JOIN asignaciones_casos ac ON (ac.caso_id = c.id AND ac.activo = 1) 
                            WHERE (ac.profesional_id IS NULL OR LOWER(c.estado) = 'pendiente') 
                            ORDER BY c.id DESC");
                        $casos = $stmt->fetchAll();
                    }
                }
            } else if (!empty($reqUser['name']) || !empty($reqUser['email'])) {
                $profIdentifier = $reqUser['name'] ?: $reqUser['email'];
                if ($hasResumenView) {
                    $stmt = $pdo->prepare("SELECT * FROM vista_casos_resumen WHERE LOWER(profesional_asignado) = ? OR LOWER(correo_profesional) = ? ORDER BY caso_id DESC");
                    $stmt->execute([strtolower($profIdentifier), strtolower($reqUser['email'])]);
                    $casos = $stmt->fetchAll();
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM casos WHERE LOWER(profesional_asignado) = ? ORDER BY id DESC");
                    $stmt->execute([strtolower($profIdentifier)]);
                    $casos = $stmt->fetchAll();
                }
            } else {
                $orderCol = $hasResumenView ? 'caso_id' : 'id';
                $stmt = $pdo->query("SELECT * FROM {$sourceTable} ORDER BY {$orderCol} DESC");
                $casos = $stmt->fetchAll();
            }
        } else {
            // Rol Ciudadano: aislamiento TOTAL. Solo casos creados por este ciudadano
            if (!empty($reqUser['email']) || !empty($reqUser['name'])) {
                $orderCol = $hasResumenView ? 'caso_id' : 'id';
                $stmt = $pdo->prepare("SELECT * FROM {$sourceTable} WHERE LOWER(correo_ciudadano) = ? OR LOWER(ciudadano) = ? ORDER BY {$orderCol} DESC");
                $stmt->execute([$reqUser['email'], strtolower($reqUser['name'])]);
                $casos = $stmt->fetchAll();
            } else {
                $casos = [];
            }
        }

        $result = array_map(function ($c) use ($pdo) {
            $checklist = [];
            if (isset($c['checklist']) && is_string($c['checklist'])) {
                $checklist = json_decode($c['checklist'] ?: '[]', true);
            } else {
                try {
                    $chkStmt = $pdo->prepare("SELECT requisito, completado FROM checklist_casos WHERE caso_id = ?");
                    $chkStmt->execute([$c['caso_id'] ?? $c['id']]);
                    $rows = $chkStmt->fetchAll();
                    $checklist = array_map(function ($r) { return $r['requisito']; }, $rows);
                } catch (Exception $e) {}
            }

            return [
                'id'          => $c['codigo'] ?? ('CAS-00' . ($c['id'] ?? '100')),
                'codigo'      => $c['codigo'] ?? ('CAS-00' . ($c['id'] ?? '100')),
                'citizen'     => $c['ciudadano'] ?? 'Ciudadano Anónimo',
                'citizenEmail'=> $c['correo_ciudadano'] ?? '',
                'type'        => $c['tipo'] ?? 'Orientación General',
                'subType'     => $c['subtipo'] ?? $c['tipo'] ?? '',
                'description' => $c['descripcion'] ?? '',
                'status'      => $c['estado'] ?? 'Pendiente',
                'assignedTo'  => $c['profesional_asignado'] ?? 'Por asignar',
                'profesional_asignado' => $c['profesional_asignado'] ?? 'Por asignar',
                'profesional_id'       => $c['profesional_id'] ?? null,
                'date'        => $c['fecha'] ?? $c['fecha_radicacion'] ?? date('Y-m-d'),
                'institution' => $c['institucion'] ?? 'Consultorio Jurídico',
                'instAddress' => $c['direccion_institucion'] ?? '',
                'instPhone'   => $c['telefono_institucion'] ?? '',
                'instHours'   => $c['horario_institucion'] ?? '',
                'roomUrl'     => $c['sala_url'] ?? '',
                'checklist'   => $checklist,
                'observations'=> $c['observaciones'] ?? '',
                'createdAt'   => $c['creado_en'] ?? date('Y-m-d H:i:s')
            ];
        }, $casos);

        echo json_encode([
            'success' => true,
            'count'   => count($result),
            'data'    => $result
        ]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 2. RECLAMAR CASO POR PARTE DE UN PROFESIONAL (action=claim)
    // -------------------------------------------------------------------------
    if ($method === 'POST' && $action === 'claim') {
        $data = getJsonInput();
        $caseId = $data['id'] ?? $data['caseId'] ?? '';
        $profName = $data['profName'] ?? $data['assignedTo'] ?? '';
        $profEmail = $data['profEmail'] ?? $data['assignedToEmail'] ?? '';

        if (!$caseId || !$profName) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'caseId y profName son requeridos.']);
            exit();
        }

        // 1. Actualizar estado a 'En curso' y profesional_asignado en casos
        try {
            $stmt = $pdo->prepare("UPDATE casos SET estado = 'En curso', profesional_asignado = ? WHERE codigo = ?");
            $stmt->execute([$profName, $caseId]);
        } catch (Exception $e) {
            $stmt = $pdo->prepare("UPDATE casos SET estado = 'En curso' WHERE codigo = ?");
            $stmt->execute([$caseId]);
        }

        // 2. Gestionar asignacion formal en 3FN si existe asignaciones_casos
        try {
            $stmtC = $pdo->prepare("SELECT id FROM casos WHERE codigo = ?");
            $stmtC->execute([$caseId]);
            $cDbId = $stmtC->fetchColumn();

            $stmtP = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(nombre) = LOWER(?) OR LOWER(correo) = LOWER(?) LIMIT 1");
            $stmtP->execute([$profName, $profEmail]);
            $pDbId = $stmtP->fetchColumn();

            if ($cDbId && $pDbId) {
                // Desactivar asignaciones anteriores
                $pdo->prepare("UPDATE asignaciones_casos SET activo = 0 WHERE caso_id = ?")->execute([$cDbId]);
                // Insertar nueva asignacion activa
                $stmtAc = $pdo->prepare("INSERT INTO asignaciones_casos (caso_id, profesional_id, activo, observaciones) VALUES (?, ?, 1, 'Asignacion auto-reclamada')");
                $stmtAc->execute([$cDbId, $pDbId]);
            }
        } catch (Exception $e) {}

        echo json_encode(['success' => true, 'message' => "Caso {$caseId} asignado exitosamente a {$profName}"]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 3. ACTUALIZAR ESTADO U OBSERVACIONES (PUT o POST action=update)
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || ($method === 'POST' && $action === 'update')) {
        $data = getJsonInput();
        $codigo = $data['id'] ?? $data['codigo'] ?? null;
        $nuevoEstado = $data['status'] ?? $data['estado'] ?? null;
        $observaciones = $data['observations'] ?? $data['observaciones'] ?? null;
        $roomUrl = $data['roomUrl'] ?? $data['sala_url'] ?? null;

        if (!$codigo) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'El identificador del caso (id) es obligatorio.']);
            exit();
        }

        $fields = [];
        $params = [];

        if ($nuevoEstado) {
            $fields[] = 'estado = ?';
            $params[] = $nuevoEstado;
        }
        if ($roomUrl !== null) {
            $fields[] = 'sala_url = ?';
            $params[] = $roomUrl;
        }

        if (!empty($fields)) {
            $params[] = $codigo;
            $sql = 'UPDATE casos SET ' . implode(', ', $fields) . ' WHERE codigo = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }

        if ($observaciones !== null) {
            try {
                $stmtC = $pdo->prepare("SELECT id FROM casos WHERE codigo = ?");
                $stmtC->execute([$codigo]);
                $cDbId = $stmtC->fetchColumn();
                if ($cDbId) {
                    $stmtObs = $pdo->prepare("UPDATE asignaciones_casos SET observaciones = ? WHERE caso_id = ? AND activo = 1");
                    $stmtObs->execute([$observaciones, $cDbId]);
                }
            } catch (Exception $e) {}
        }

        echo json_encode(['success' => true, 'message' => 'Expediente actualizado exitosamente en la base de datos.']);
        exit();
    }

    // -------------------------------------------------------------------------
    // 4. CREAR NUEVO EXPEDIENTE DE CASO (POST)
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $data = getJsonInput();
        $reqUser = getRequestUser();

        $codigo = $data['id'] ?? ('CAS-00' . rand(100, 999));
        $ciudadano = $data['citizen'] ?? ($reqUser['name'] ?: 'Ciudadano Anonimo');
        $correo = strtolower($data['citizenEmail'] ?? ($reqUser['email'] ?: ''));
        $tipo = $data['type'] ?? 'Problema laboral';
        $subtipo = $data['subType'] ?? $data['subtipo'] ?? $tipo;
        $descripcion = $data['description'] ?? $data['descripcion'] ?? '';
        $estado = !empty($data['status']) ? $data['status'] : 'Pendiente'; // Estado inicial correcto
        $profAsignado = !empty($data['assignedTo']) ? $data['assignedTo'] : 'Por asignar'; // 'Por asignar' inicial
        $institucion = $data['institution'] ?? 'Consultorio Juridico';
        $checklist = $data['checklist'] ?? [];
        $roomUrl = $data['roomUrl'] ?? null;

        // Comprobar si la tabla casos usa el esquema normalizado 3FN (ciudadano_id) o plano
        $hasColCiudadanoId = false;
        try {
            $colCheck = $pdo->query("SHOW COLUMNS FROM casos LIKE 'ciudadano_id'");
            $hasColCiudadanoId = ($colCheck && $colCheck->rowCount() > 0);
        } catch (Exception $e) {}

        if ($hasColCiudadanoId) {
            // Esquema normalizado 3FN
            $userId = null;
            if (!empty($correo)) {
                $stmtU = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(correo) = ?");
                $stmtU->execute([$correo]);
                $userId = $stmtU->fetchColumn();
            }
            if (!$userId) {
                $stmtFirst = $pdo->query("SELECT id FROM usuarios WHERE rol_id = 1 LIMIT 1");
                $userId = $stmtFirst->fetchColumn() ?: 1;
            }

            $catId = 1;
            try {
                $stmtCat = $pdo->prepare("SELECT id FROM categorias_casos WHERE LOWER(nombre) LIKE ? LIMIT 1");
                $stmtCat->execute(['%' . strtolower($tipo) . '%']);
                $catId = $stmtCat->fetchColumn() ?: 1;
            } catch (Exception $e) {}

            $instId = 1;
            try {
                $stmtInst = $pdo->prepare("SELECT id FROM instituciones WHERE LOWER(nombre) LIKE ? LIMIT 1");
                $stmtInst->execute(['%' . strtolower($institucion) . '%']);
                $instId = $stmtInst->fetchColumn() ?: 1;
            } catch (Exception $e) {}

            $sql = "INSERT INTO casos (
                codigo, ciudadano_id, categoria_id, institucion_id, subtipo, descripcion,
                estado, fecha_radicacion, sala_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $codigo, $userId, $catId, $instId, $subtipo, $descripcion,
                $estado, date('Y-m-d'), $roomUrl
            ]);
            $casoDbId = $pdo->lastInsertId();

            if (!empty($checklist) && is_array($checklist)) {
                try {
                    $chkInsert = $pdo->prepare("INSERT INTO checklist_casos (caso_id, requisito, completado) VALUES (?, ?, 0)");
                    foreach ($checklist as $item) {
                        if (is_string($item) && trim($item) !== '') {
                            $chkInsert->execute([$casoDbId, trim($item)]);
                        }
                    }
                } catch (Exception $e) {}
            }
        } else {
            // Esquema directo / plano (database.sql)
            $sql = "INSERT INTO casos (
                codigo, ciudadano, correo_ciudadano, tipo, subtipo, descripcion,
                estado, profesional_asignado, fecha, institucion, sala_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $codigo, $ciudadano, $correo, $tipo, $subtipo, $descripcion,
                $estado, $profAsignado, date('Y-m-d'), $institucion, $roomUrl
            ]);
            $casoDbId = $pdo->lastInsertId();
        }

        echo json_encode([
            'success' => true,
            'message' => 'Expediente registrado exitosamente con estado inicial Pendiente y Por asignar.',
            'id'      => $codigo,
            'data'    => [
                'id'           => $codigo,
                'codigo'       => $codigo,
                'citizen'      => $ciudadano,
                'citizenEmail' => $correo,
                'status'       => $estado,
                'assignedTo'   => $profAsignado,
                'type'         => $tipo
            ]
        ]);
        exit();
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Metodo HTTP no permitido.']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
