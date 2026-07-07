export function load({ params }: { params: { roomId: string } }) {
	return { roomId: params.roomId };
}
