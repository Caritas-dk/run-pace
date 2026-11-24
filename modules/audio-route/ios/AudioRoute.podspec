Pod::Spec.new do |s|
  s.name           = 'AudioRoute'
  s.version        = '1.0.0'
  s.summary        = 'Registrerer tab af høretelefoner for Run Pace'
  s.description    = 'Registrerer tab af høretelefoner for Run Pace'
  s.license        = 'UNLICENSED'
  s.author         = 'TEAM INGBERG'
  s.homepage       = 'https://github.com/Caritas-dk/run-pace'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Caritas-dk/run-pace.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
