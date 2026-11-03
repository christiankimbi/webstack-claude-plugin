<?php
// usage: php run-case.php <handler.php> <case.json> <result.json>
// Runs one real form handler with the case as its POST body. The stub mailer next to the
// handler records each message in $GLOBALS['webstackMessages'] instead of sending it.
[$_, $handler, $caseFile, $resultFile] = $argv;
$GLOBALS['webstackMessages'] = [];
$_POST = json_decode((string)file_get_contents($caseFile), true) ?? [];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

register_shutdown_function(function () use ($resultFile) {
    $output = ob_get_level() ? ob_get_clean() : '';
    $error = error_get_last();
    file_put_contents($resultFile, json_encode([
        'response' => $output,
        'status' => http_response_code() ?: 200,
        'fatal' => ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_COMPILE_ERROR, E_CORE_ERROR], true)) ? $error['message'] : null,
        'messages' => $GLOBALS['webstackMessages'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE));
});

ob_start();
chdir(dirname($handler));
include $handler;
