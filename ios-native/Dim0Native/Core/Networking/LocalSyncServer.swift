import Darwin
import Foundation
import Network

final class LocalSyncServer {
    enum State: Equatable {
        case stopped
        case starting
        case ready(address: String)
        case failed(message: String)
    }

    let pairingCode: String
    let port: UInt16 = 8765

    var onStateChange: ((State) -> Void)?
    var onPeerCountChange: ((Int) -> Void)?
    var onSnapshotRequested: (() -> Void)?

    private final class Peer {
        let connection: NWConnection
        var authenticated = false

        init(connection: NWConnection) {
            self.connection = connection
        }
    }

    private struct ClientMessage: Decodable {
        let kind: String
        let code: String?
    }

    private let queue = DispatchQueue(label: "com.dim0.native-sync")
    private var listener: NWListener?
    private var peers: [ObjectIdentifier: Peer] = [:]
    private var latestSnapshot: Data?

    init(pairingCode: String = String(format: "%06d", Int.random(in: 0...999_999))) {
        self.pairingCode = pairingCode
    }

    /// Starts the foreground-only local WebSocket server used by the desktop canvas.
    func start() {
        queue.async { [weak self] in
            guard let self, listener == nil else { return }
            publishState(.starting)

            do {
                let parameters = NWParameters.tcp
                let webSocketOptions = NWProtocolWebSocket.Options()
                webSocketOptions.autoReplyPing = true
                parameters.defaultProtocolStack.applicationProtocols.insert(webSocketOptions, at: 0)

                guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
                    publishState(.failed(message: "端口不可用"))
                    return
                }
                let listener = try NWListener(using: parameters, on: endpointPort)
                listener.newConnectionHandler = { [weak self] connection in
                    self?.accept(connection)
                }
                listener.stateUpdateHandler = { [weak self] state in
                    self?.handleListenerState(state)
                }
                self.listener = listener
                listener.start(queue: queue)
            } catch {
                publishState(.failed(message: error.localizedDescription))
            }
        }
    }

    /// Stops listening and closes every paired desktop connection.
    func stop() {
        queue.async { [weak self] in
            guard let self else { return }
            listener?.cancel()
            listener = nil
            peers.values.forEach { $0.connection.cancel() }
            peers.removeAll()
            publishPeerCount()
            publishState(.stopped)
        }
    }

    /// Replaces the cached full snapshot and broadcasts it to authenticated peers.
    func publish(snapshot: Data) {
        queue.async { [weak self] in
            guard let self else { return }
            latestSnapshot = snapshot
            for peer in peers.values where peer.authenticated {
                send(snapshot, to: peer.connection)
            }
        }
    }

    private func accept(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        peers[id] = Peer(connection: connection)
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let self, let connection else { return }
            switch state {
            case .ready:
                receive(on: connection)
            case .failed, .cancelled:
                remove(connection)
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self, weak connection] data, _, _, error in
            guard let self, let connection else { return }
            if let data {
                handle(data, from: connection)
            }
            if error == nil {
                receive(on: connection)
            } else {
                remove(connection)
            }
        }
    }

    private func handle(_ data: Data, from connection: NWConnection) {
        guard let message = try? JSONDecoder().decode(ClientMessage.self, from: data),
              let peer = peers[ObjectIdentifier(connection)] else {
            return
        }

        switch message.kind {
        case "dim0.native-ink.hello":
            guard message.code == pairingCode else {
                connection.cancel()
                return
            }
            if !peer.authenticated {
                peer.authenticated = true
                publishPeerCount()
            }
            sendReady(to: connection)
            if let latestSnapshot {
                send(latestSnapshot, to: connection)
            }
        case "dim0.native-ink.request-snapshot" where peer.authenticated:
            onSnapshotRequested?()
        default:
            break
        }
    }

    private func handleListenerState(_ state: NWListener.State) {
        switch state {
        case .ready:
            publishState(.ready(address: LocalNetworkAddress.wifiIPv4() ?? "iPad 的 Wi-Fi 地址"))
        case .failed(let error):
            publishState(.failed(message: error.localizedDescription))
        case .cancelled:
            publishState(.stopped)
        default:
            break
        }
    }

    private func sendReady(to connection: NWConnection) {
        let data = Data("{\"kind\":\"dim0.native-ink.ready\",\"version\":1}".utf8)
        send(data, to: connection)
    }

    private func send(_ data: Data, to connection: NWConnection) {
        let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
        let context = NWConnection.ContentContext(
            identifier: "dim0.native-ink.message",
            metadata: [metadata]
        )
        connection.send(
            content: data,
            contentContext: context,
            isComplete: true,
            completion: .contentProcessed { [weak self, weak connection] error in
                guard error != nil, let self, let connection else { return }
                self.queue.async {
                    self.remove(connection)
                }
            }
        )
    }

    private func remove(_ connection: NWConnection) {
        let peer = peers.removeValue(forKey: ObjectIdentifier(connection))
        connection.cancel()
        if peer?.authenticated == true {
            publishPeerCount()
        }
    }

    private func publishState(_ state: State) {
        DispatchQueue.main.async { [weak self] in
            self?.onStateChange?(state)
        }
    }

    private func publishPeerCount() {
        let count = peers.values.filter(\.authenticated).count
        DispatchQueue.main.async { [weak self] in
            self?.onPeerCountChange?(count)
        }
    }
}

private enum LocalNetworkAddress {
    /// Returns the current Wi-Fi IPv4 address without contacting an external service.
    static func wifiIPv4() -> String? {
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else { return nil }
        defer { freeifaddrs(interfaces) }

        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let interface = pointer.pointee
            guard let address = interface.ifa_addr,
                  address.pointee.sa_family == UInt8(AF_INET),
                  String(cString: interface.ifa_name) == "en0" else {
                continue
            }

            var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                address,
                socklen_t(address.pointee.sa_len),
                &hostname,
                socklen_t(hostname.count),
                nil,
                0,
                NI_NUMERICHOST
            )
            if result == 0 {
                return String(cString: hostname)
            }
        }
        return nil
    }
}
